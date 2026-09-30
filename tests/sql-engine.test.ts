import { describe, expect, it } from "vitest";
import { executeSql, MAX_SQL_LENGTH, type SqlDatabase, type SqlResult } from "@/modules/labs/engine/sql";

function baseDb(): SqlDatabase {
  return {
    tables: {
      Customers: {
        columns: [
          { name: "id", type: "INT", primaryKey: true },
          { name: "name", type: "NVARCHAR(20)", notNull: true },
          { name: "status", type: "VARCHAR(20)" },
          { name: "total", type: "INT" },
        ],
        rows: [
          { id: 1, name: "Ada", status: "shipped", total: 10 },
          { id: 2, name: "Bob", status: "pending", total: 20 },
          { id: 3, name: "Cy", status: "shipped", total: 30 },
        ],
      },
      Orders: {
        columns: [
          { name: "id", type: "INT", primaryKey: true },
          { name: "customerId", type: "INT" },
          { name: "amount", type: "INT" },
        ],
        rows: [
          { id: 100, customerId: 1, amount: 8 },
          { id: 101, customerId: 1, amount: 12 },
          { id: 102, customerId: 4, amount: 99 },
        ],
      },
      "SalesLT.Product": {
        columns: [
          { name: "ProductID", type: "INT", primaryKey: true },
          { name: "Name", type: "NVARCHAR(20)" },
        ],
        rows: [{ ProductID: 7, Name: "Helmet" }],
      },
      Docs: {
        rows: [
          { id: "1", status: "shipped", total: 10, customer: { city: "Paris" }, tags: ["new", "blue"], name: "Alpha" },
          { id: "2", status: "Shipped", total: 20, customer: { city: "Rome" }, tags: ["red"], name: "beta" },
        ],
      },
    },
  };
}

function rows(result: SqlResult): unknown[][] {
  expect(result.ok && result.kind === "rows").toBe(true);
  return result.ok && result.kind === "rows" ? result.rows : [];
}

function documents(result: SqlResult): unknown[] {
  expect(result.ok && result.kind === "documents").toBe(true);
  return result.ok && result.kind === "documents" ? result.documents : [];
}

function error(result: SqlResult): string {
  expect(result.ok).toBe(false);
  return result.ok ? "" : result.error;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

describe("executeSql relational engine", () => {
  it("exports the documented length cap", () => {
    expect(MAX_SQL_LENGTH).toBe(4000);
  });

  it("selects all declared columns", () => {
    const result = executeSql(baseDb(), "SELECT * FROM Customers");
    expect(result.ok && result.kind === "rows" ? result.columns : []).toEqual(["id", "name", "status", "total"]);
    expect(rows(result)).toHaveLength(3);
  });

  it("selects without a FROM clause", () => {
    expect(rows(executeSql(baseDb(), "SELECT 1 + 1 AS two"))).toEqual([[2]]);
  });

  it("uses aliases and no-column-name display names", () => {
    const result = executeSql(baseDb(), "SELECT name AS customerName, total + 1 FROM Customers WHERE id = 1");
    expect(result.ok && result.kind === "rows" ? result.columns : []).toEqual(["customerName", "(No column name)"]);
    expect(rows(result)).toEqual([["Ada", 11]]);
  });

  it("handles bracketed schema-qualified table names", () => {
    expect(rows(executeSql(baseDb(), "SELECT Name FROM [SalesLT].[Product]"))).toEqual([["Helmet"]]);
  });

  it("handles quoted identifiers", () => {
    expect(rows(executeSql(baseDb(), 'SELECT "name" FROM "Customers" WHERE "id" = 2'))).toEqual([["Bob"]]);
  });

  it("uses case-insensitive table and column lookup", () => {
    expect(rows(executeSql(baseDb(), "SELECT NAME FROM customers WHERE STATUS = 'SHIPPED'"))).toEqual([["Ada"], ["Cy"]]);
  });

  it("honors arithmetic precedence", () => {
    expect(rows(executeSql(baseDb(), "SELECT 1 + 2 * 3 AS v"))).toEqual([[7]]);
  });

  it("honors parentheses", () => {
    expect(rows(executeSql(baseDb(), "SELECT (1 + 2) * 3 AS v"))).toEqual([[9]]);
  });

  it("supports unary minus", () => {
    expect(rows(executeSql(baseDb(), "SELECT -total AS v FROM Customers WHERE id = 1"))).toEqual([[-10]]);
  });

  it("concatenates strings with plus", () => {
    expect(rows(executeSql(baseDb(), "SELECT name + '-x' AS v FROM Customers WHERE id = 1"))).toEqual([["Ada-x"]]);
  });

  it("escapes single quotes in strings", () => {
    expect(rows(executeSql(baseDb(), "SELECT 'it''s' AS v"))).toEqual([["it's"]]);
  });

  it("supports unicode string literal prefix", () => {
    expect(rows(executeSql(baseDb(), "SELECT N'café' AS v"))).toEqual([["café"]]);
  });

  it("uses three-valued NULL logic in WHERE", () => {
    expect(rows(executeSql(baseDb(), "SELECT id FROM Customers WHERE NULL = NULL"))).toEqual([]);
  });

  it("supports IS NULL", () => {
    expect(rows(executeSql(baseDb(), "SELECT 1 AS v WHERE NULL IS NULL"))).toEqual([[1]]);
  });

  it("supports IS NOT NULL", () => {
    expect(rows(executeSql(baseDb(), "SELECT 1 AS v WHERE 2 IS NOT NULL"))).toEqual([[1]]);
  });

  it("supports AND OR and NOT precedence", () => {
    expect(rows(executeSql(baseDb(), "SELECT id FROM Customers WHERE NOT status = 'pending' AND id = 1 OR id = 99"))).toEqual([[1]]);
  });

  it("supports IN", () => {
    expect(rows(executeSql(baseDb(), "SELECT id FROM Customers WHERE id IN (1, 3) ORDER BY id"))).toEqual([[1], [3]]);
  });

  it("supports NOT IN", () => {
    expect(rows(executeSql(baseDb(), "SELECT id FROM Customers WHERE id NOT IN (1, 3)"))).toEqual([[2]]);
  });

  it("supports BETWEEN", () => {
    expect(rows(executeSql(baseDb(), "SELECT id FROM Customers WHERE total BETWEEN 10 AND 20 ORDER BY id"))).toEqual([[1], [2]]);
  });

  it("supports NOT BETWEEN", () => {
    expect(rows(executeSql(baseDb(), "SELECT id FROM Customers WHERE total NOT BETWEEN 10 AND 20"))).toEqual([[3]]);
  });

  it("supports LIKE percent", () => {
    expect(rows(executeSql(baseDb(), "SELECT name FROM Customers WHERE name LIKE 'a%'"))).toEqual([["Ada"]]);
  });

  it("supports LIKE underscore", () => {
    expect(rows(executeSql(baseDb(), "SELECT name FROM Customers WHERE name LIKE 'B_b'"))).toEqual([["Bob"]]);
  });

  it("supports NOT LIKE", () => {
    expect(rows(executeSql(baseDb(), "SELECT id FROM Customers WHERE name NOT LIKE 'A%' ORDER BY id"))).toEqual([[2], [3]]);
  });

  it("supports DISTINCT", () => {
    expect(rows(executeSql(baseDb(), "SELECT DISTINCT status FROM Customers ORDER BY status"))).toEqual([["pending"], ["shipped"]]);
  });

  it("supports TOP with parentheses", () => {
    const result = executeSql(baseDb(), "SELECT TOP (2) id FROM Customers ORDER BY id DESC");
    expect(result.ok && result.kind === "rows" ? result.rowCount : 0).toBe(2);
    expect(rows(result)).toEqual([[3], [2]]);
  });

  it("supports TOP without parentheses", () => {
    expect(rows(executeSql(baseDb(), "SELECT TOP 1 id FROM Customers ORDER BY id"))).toEqual([[1]]);
  });

  it("supports LIMIT", () => {
    expect(rows(executeSql(baseDb(), "SELECT id FROM Customers ORDER BY id LIMIT 2"))).toEqual([[1], [2]]);
  });

  it("supports OFFSET FETCH", () => {
    expect(rows(executeSql(baseDb(), "SELECT id FROM Customers ORDER BY id OFFSET 1 ROWS FETCH NEXT 1 ROWS ONLY"))).toEqual([[2]]);
  });

  it("orders by alias descending", () => {
    expect(rows(executeSql(baseDb(), "SELECT total AS t FROM Customers ORDER BY t DESC"))).toEqual([[30], [20], [10]]);
  });

  it("orders by ordinal", () => {
    expect(rows(executeSql(baseDb(), "SELECT name, total FROM Customers ORDER BY 2 DESC"))).toEqual([["Cy", 30], ["Bob", 20], ["Ada", 10]]);
  });

  it("caps returned rows while reporting true row count", () => {
    const result = executeSql(baseDb(), "SELECT id FROM Customers ORDER BY id", { maxRows: 2 });
    expect(result.ok && result.kind === "rows" ? result.rowCount : 0).toBe(3);
    expect(rows(result)).toEqual([[1], [2]]);
  });

  it("counts rows", () => {
    expect(rows(executeSql(baseDb(), "SELECT COUNT(*) AS c FROM Customers"))).toEqual([[3]]);
  });

  it("counts non-null expressions", () => {
    expect(rows(executeSql(baseDb(), "SELECT COUNT(status) AS c FROM Customers"))).toEqual([[3]]);
  });

  it("counts distinct values", () => {
    expect(rows(executeSql(baseDb(), "SELECT COUNT(DISTINCT status) AS c FROM Customers"))).toEqual([[2]]);
  });

  it("sums values", () => {
    expect(rows(executeSql(baseDb(), "SELECT SUM(total) AS s FROM Customers"))).toEqual([[60]]);
  });

  it("averages values", () => {
    expect(rows(executeSql(baseDb(), "SELECT AVG(total) AS a FROM Customers"))).toEqual([[20]]);
  });

  it("computes min and max", () => {
    expect(rows(executeSql(baseDb(), "SELECT MIN(total) AS mn, MAX(total) AS mx FROM Customers"))).toEqual([[10, 30]]);
  });

  it("groups rows", () => {
    expect(rows(executeSql(baseDb(), "SELECT status, SUM(total) AS s FROM Customers GROUP BY status ORDER BY status"))).toEqual([
      ["pending", 20],
      ["shipped", 40],
    ]);
  });

  it("filters groups with HAVING", () => {
    expect(rows(executeSql(baseDb(), "SELECT status, SUM(total) AS s FROM Customers GROUP BY status HAVING SUM(total) > 20"))).toEqual([["shipped", 40]]);
  });

  it("aggregates an empty input", () => {
    expect(rows(executeSql(baseDb(), "SELECT COUNT(*) AS c, SUM(total) AS s FROM Customers WHERE id = 99"))).toEqual([[0, null]]);
  });

  it("supports scalar functions", () => {
    expect(rows(executeSql(baseDb(), "SELECT UPPER('ab'), LOWER('AB'), LEN('abc'), LENGTH('abcd'), ROUND(1.25, 1), ABS(-2), CONCAT('a', NULL, 'b'), SUBSTRING('abcdef', 2, 3)"))).toEqual([
      ["AB", "ab", 3, 4, 1.3, 2, "ab", "bcd"],
    ]);
  });

  it("rejects GETDATE", () => {
    expect(error(executeSql(baseDb(), "SELECT GETDATE()"))).toBe("GETDATE is not available in this simulation.");
  });

  it("joins inner tables", () => {
    expect(rows(executeSql(baseDb(), "SELECT c.name, o.amount FROM Customers c INNER JOIN Orders o ON c.id = o.customerId ORDER BY o.id"))).toEqual([
      ["Ada", 8],
      ["Ada", 12],
    ]);
  });

  it("joins left tables", () => {
    expect(rows(executeSql(baseDb(), "SELECT c.name, o.amount FROM Customers c LEFT JOIN Orders o ON c.id = o.customerId ORDER BY c.id, o.amount"))).toEqual([
      ["Ada", 8],
      ["Ada", 12],
      ["Bob", null],
      ["Cy", null],
    ]);
  });

  it("detects ambiguous columns", () => {
    expect(error(executeSql(baseDb(), "SELECT id FROM Customers c JOIN Orders o ON c.id = o.customerId"))).toBe("Ambiguous column name 'id'.");
  });

  it("supports qualified star", () => {
    const result = executeSql(baseDb(), "SELECT c.* FROM Customers c WHERE c.id = 1");
    expect(result.ok && result.kind === "rows" ? result.columns : []).toEqual(["id", "name", "status", "total"]);
  });

  it("creates tables", () => {
    const result = executeSql({ tables: {} }, "CREATE TABLE People (id INT PRIMARY KEY, name NVARCHAR(10) NOT NULL)");
    expect(result.ok && result.kind === "affected" ? result.message : "").toBe("Commands completed successfully.");
    expect(result.ok ? Object.keys(result.database.tables) : []).toEqual(["People"]);
  });

  it("rejects duplicate CREATE TABLE", () => {
    expect(error(executeSql(baseDb(), "CREATE TABLE Customers (id INT)"))).toBe("There is already an object named 'Customers' in the database.");
  });

  it("drops tables", () => {
    const result = executeSql(baseDb(), "DROP TABLE Customers");
    expect(result.ok ? result.database.tables.Customers : "present").toBeUndefined();
  });

  it("supports DROP TABLE IF EXISTS", () => {
    expect(executeSql(baseDb(), "DROP TABLE IF EXISTS Missing").ok).toBe(true);
  });

  it("inserts rows and coerces values", () => {
    const result = executeSql(baseDb(), "INSERT INTO Customers(id, name, status, total) VALUES ('4', 'Dee', 'new', '40')");
    expect(result.ok ? result.database.tables.Customers?.rows.at(-1) : undefined).toMatchObject({ id: 4, total: 40 });
  });

  it("auto-increments identity", () => {
    const created = executeSql({ tables: {} }, "CREATE TABLE People (id INT IDENTITY(1,1) PRIMARY KEY, name NVARCHAR(10))");
    const inserted = executeSql(created.ok ? created.database : { tables: {} }, "INSERT INTO People(name) VALUES('Ann'),('Bo')");
    expect(rows(executeSql(inserted.ok ? inserted.database : { tables: {} }, "SELECT id, name FROM People ORDER BY id"))).toEqual([
      [1, "Ann"],
      [2, "Bo"],
    ]);
  });

  it("enforces NOT NULL", () => {
    expect(error(executeSql(baseDb(), "INSERT INTO Customers(id, name) VALUES(4, NULL)"))).toContain("Cannot insert the value NULL");
  });

  it("enforces primary keys", () => {
    expect(error(executeSql(baseDb(), "INSERT INTO Customers(id, name) VALUES(1, 'Dup')"))).toContain("Violation of PRIMARY KEY constraint");
  });

  it("rejects string truncation", () => {
    const created = executeSql({ tables: {} }, "CREATE TABLE T (name NVARCHAR(2))");
    expect(error(executeSql(created.ok ? created.database : { tables: {} }, "INSERT INTO T(name) VALUES('toolong')"))).toBe("String or binary data would be truncated.");
  });

  it("rejects column count mismatch", () => {
    expect(error(executeSql(baseDb(), "INSERT INTO Customers(id, name) VALUES(4)"))).toBe("Column name or number of supplied values does not match table definition.");
  });

  it("updates rows", () => {
    const result = executeSql(baseDb(), "UPDATE Customers SET total = total + 5 WHERE id = 1");
    expect(rows(executeSql(result.ok ? result.database : baseDb(), "SELECT total FROM Customers WHERE id = 1"))).toEqual([[15]]);
  });

  it("enforces update types", () => {
    expect(error(executeSql(baseDb(), "UPDATE Customers SET total = 'nope' WHERE id = 1"))).toContain("Conversion failed");
  });

  it("deletes rows with DELETE FROM", () => {
    const result = executeSql(baseDb(), "DELETE FROM Customers WHERE id = 2");
    expect(rows(executeSql(result.ok ? result.database : baseDb(), "SELECT id FROM Customers ORDER BY id"))).toEqual([[1], [3]]);
  });

  it("deletes rows with DELETE name", () => {
    const result = executeSql(baseDb(), "DELETE Customers WHERE id = 2");
    expect(result.ok && result.kind === "affected" ? result.rowCount : 0).toBe(1);
  });

  it("executes batches and returns the last result", () => {
    expect(rows(executeSql(baseDb(), "UPDATE Customers SET total = 11 WHERE id = 1; SELECT total FROM Customers WHERE id = 1"))).toEqual([[11]]);
  });

  it("sums affected rows for all-DML batches", () => {
    const result = executeSql(baseDb(), "UPDATE Customers SET total = total + 1 WHERE id = 1; DELETE Customers WHERE id = 2");
    expect(result.ok && result.kind === "affected" ? result.rowCount : 0).toBe(2);
  });

  it("rolls back failed batches", () => {
    const db = baseDb();
    const result = executeSql(db, "UPDATE Customers SET total = 11 WHERE id = 1; INSERT INTO Customers(id, name) VALUES(1, 'Dup')");
    expect(result.ok).toBe(false);
    expect(db.tables.Customers?.rows[0]?.total).toBe(10);
    expect(result.database).toBe(db);
  });

  it("does not mutate deep-frozen input", () => {
    const db = deepFreeze(baseDb());
    const result = executeSql(db, "UPDATE Customers SET total = 99 WHERE id = 1");
    expect(result.ok).toBe(true);
    expect(db.tables.Customers?.rows[0]?.total).toBe(10);
  });

  it("supports comments", () => {
    expect(rows(executeSql(baseDb(), "-- hi\nSELECT /* x */ id FROM Customers WHERE id = 1"))).toEqual([[1]]);
  });

  it("rejects unsupported statements", () => {
    expect(error(executeSql(baseDb(), "ALTER TABLE Customers ADD x INT"))).toBe("The statement 'ALTER' is not supported in this simulation.");
  });

  it("reports syntax errors", () => {
    expect(error(executeSql(baseDb(), "SELECT FROM Customers"))).toBe("Incorrect syntax near 'FROM'.");
  });

  it("reports unknown tables", () => {
    expect(error(executeSql(baseDb(), "SELECT * FROM Missing"))).toBe("Invalid object name 'Missing'.");
  });

  it("reports unknown columns", () => {
    expect(error(executeSql(baseDb(), "SELECT missing FROM Customers"))).toBe("Invalid column name 'missing'.");
  });

  it("reports aggregate misuse", () => {
    expect(error(executeSql(baseDb(), "SELECT name, SUM(total) FROM Customers"))).toContain("is invalid in the select list");
  });

  it("rejects input beyond the cap", () => {
    expect(error(executeSql(baseDb(), `SELECT 1 ${" ".repeat(MAX_SQL_LENGTH)}`))).toContain("exceeds maximum length");
  });
});

describe("executeSql document mode", () => {
  it("queries default table aliases", () => {
    expect(documents(executeSql(baseDb(), "SELECT * FROM c WHERE c.status = 'shipped'", { defaultTable: "Docs" }))).toHaveLength(1);
  });

  it("accepts double-quoted string literals like Cosmos DB", () => {
    expect(documents(executeSql(baseDb(), 'SELECT VALUE c.name FROM c WHERE c.status = "shipped"', { defaultTable: "Docs" }))).toEqual(["Alpha"]);
    expect(documents(executeSql(baseDb(), 'SELECT VALUE c.id FROM c WHERE c.name = "Al\\"pha"', { defaultTable: "Docs" }))).toEqual([]);
  });

  it("uses case-sensitive document comparisons", () => {
    expect(documents(executeSql(baseDb(), "SELECT * FROM c WHERE c.status = 'SHIPPED'", { defaultTable: "Docs" }))).toEqual([]);
  });

  it("projects document paths", () => {
    expect(documents(executeSql(baseDb(), "SELECT c.id, c.customer.city AS city FROM c ORDER BY c.id", { defaultTable: "Docs" }))).toEqual([
      { id: "1", city: "Paris" },
      { id: "2", city: "Rome" },
    ]);
  });

  it("supports document VALUE projection", () => {
    expect(documents(executeSql(baseDb(), "SELECT VALUE c.name FROM c WHERE c.id = '1'", { defaultTable: "Docs" }))).toEqual(["Alpha"]);
  });

  it("supports document bracket path projection", () => {
    expect(documents(executeSql(baseDb(), 'SELECT VALUE c["status"] FROM c WHERE c.id = \'1\'', { defaultTable: "Docs" }))).toEqual(["shipped"]);
  });

  it("supports document aggregate VALUE", () => {
    expect(documents(executeSql(baseDb(), "SELECT VALUE COUNT(1) FROM c", { defaultTable: "Docs" }))).toEqual([2]);
  });

  it("supports document aggregate object projection", () => {
    expect(documents(executeSql(baseDb(), "SELECT COUNT(1) AS orders FROM c", { defaultTable: "Docs" }))).toEqual([{ orders: 2 }]);
  });

  it("supports document functions", () => {
    expect(documents(executeSql(baseDb(), "SELECT c.id FROM c WHERE IS_DEFINED(c.customer.city) AND ARRAY_CONTAINS(c.tags, 'red')", { defaultTable: "Docs" }))).toEqual([{ id: "2" }]);
  });

  it("supports CONTAINS and STARTSWITH", () => {
    expect(documents(executeSql(baseDb(), "SELECT VALUE c.id FROM c WHERE CONTAINS(c.name, 'lph') OR STARTSWITH(c.name, 'bet') ORDER BY c.id", { defaultTable: "Docs" }))).toEqual(["1", "2"]);
  });

  it("orders and limits documents", () => {
    expect(documents(executeSql(baseDb(), "SELECT c.id FROM c ORDER BY c.total DESC OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY", { defaultTable: "Docs" }))).toEqual([{ id: "2" }]);
  });

  it("queries document containers relationally by real name", () => {
    const result = executeSql(baseDb(), "SELECT * FROM Docs ORDER BY id");
    expect(result.ok && result.kind === "rows" ? result.columns : []).toContain("customer");
    expect(rows(result)[0]?.[3]).toBe(JSON.stringify({ city: "Paris" }));
  });
});
