export type SqlValue = string | number | boolean | null;
export type SqlColumn = { name: string; type: string; notNull?: boolean; primaryKey?: boolean };
/** Relational tables have `columns`; document containers (Cosmos DB style) may omit them and hold arbitrary JSON rows. */
export type SqlTable = { columns?: SqlColumn[]; rows: Record<string, unknown>[] };
export type SqlDatabase = { tables: Record<string, SqlTable> };

export type SqlResult =
  | { ok: true; kind: "rows"; columns: string[]; rows: SqlValue[][]; rowCount: number; message: string; database: SqlDatabase }
  | { ok: true; kind: "documents"; documents: unknown[]; rowCount: number; message: string; database: SqlDatabase }
  | { ok: true; kind: "affected"; rowCount: number; message: string; database: SqlDatabase }
  | { ok: false; error: string; database: SqlDatabase };

export type SqlOptions = {
  /** Table used when the FROM clause names an alias that is not a table (Cosmos DB style `FROM c`). */
  defaultTable?: string;
  /** Maximum rows/documents returned (default 200). */
  maxRows?: number;
};

export const MAX_SQL_LENGTH = 4000;

type TokenKind = "identifier" | "number" | "string" | "symbol" | "eof";
type Token = { kind: TokenKind; text: string; value?: string | number; position: number; quoted?: boolean };
type UnaryOp = "NEG" | "NOT";
type BinaryOp =
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "="
  | "<>"
  | "!="
  | "<"
  | ">"
  | "<="
  | ">="
  | "AND"
  | "OR";
type Expr =
  | { type: "literal"; value: unknown }
  | { type: "column"; parts: string[] }
  | { type: "unary"; op: UnaryOp; expr: Expr }
  | { type: "binary"; op: BinaryOp; left: Expr; right: Expr }
  | { type: "isNull"; expr: Expr; not: boolean }
  | { type: "between"; expr: Expr; low: Expr; high: Expr; not: boolean }
  | { type: "in"; expr: Expr; values: Expr[]; not: boolean }
  | { type: "like"; expr: Expr; pattern: Expr; not: boolean }
  | { type: "call"; name: string; args: Expr[]; distinct?: boolean; star?: boolean };
type SelectItem = { expr?: Expr; star?: boolean; tableStar?: string; alias?: string; value?: boolean };
type TableRef = { name: string; alias?: string };
type Join = { kind: "inner" | "left"; table: TableRef; on: Expr };
type OrderItem = { expr: Expr; direction: "ASC" | "DESC" };
type SelectStmt = {
  type: "select";
  distinct: boolean;
  top?: number;
  items: SelectItem[];
  from?: TableRef;
  joins: Join[];
  where?: Expr;
  groupBy: Expr[];
  having?: Expr;
  orderBy: OrderItem[];
  offset?: number;
  fetch?: number;
  limit?: number;
};
type ColumnDef = { name: string; typeName: string; notNull: boolean; primaryKey: boolean; identity: boolean; length?: number };
type Statement =
  | { type: "create"; name: string; columns: ColumnDef[] }
  | { type: "drop"; name: string; ifExists: boolean }
  | { type: "insert"; name: string; columns?: string[]; rows: Expr[][] }
  | SelectStmt
  | { type: "update"; name: string; assignments: { column: string; expr: Expr }[]; where?: Expr }
  | { type: "delete"; name: string; where?: Expr };
type ScopeRow = {
  sources: Record<string, Record<string, unknown> | undefined>;
  columns: Map<string, { value: unknown; display: string; count: number }>;
};
type EvalOptions = { caseSensitiveStrings: boolean; aggregateRows?: ScopeRow[]; groupValues?: Map<string, unknown> };

class SqlError extends Error {
  public constructor(message: string) {
    super(message);
  }
}

function cloneDatabase(db: SqlDatabase): SqlDatabase {
  return {
    tables: Object.fromEntries(
      Object.entries(db.tables).map(([name, table]) => [
        name,
        {
          columns: table.columns?.map((c) => ({ ...c })),
          rows: table.rows.map((row) => cloneRecord(row)),
          ...(tableIdentity(table) ? { identity: tableIdentity(table) } : {}),
        },
      ]),
    ),
  };
}

function cloneRecord(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) out[key] = cloneUnknown(value);
  return out;
}

function cloneUnknown(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => cloneUnknown(v));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) out[key] = cloneUnknown(child);
    return out;
  }
  return value;
}

function affectedMessage(n: number): string {
  return `(${n} ${n === 1 ? "row" : "rows"} affected)`;
}

function normalizeName(name: string): string {
  return name.toLocaleLowerCase();
}

function sqlValue(value: unknown): SqlValue {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") return value;
  return JSON.stringify(value);
}

export function formatSqlValue(value: unknown): SqlValue {
  return sqlValue(value);
}

class Tokenizer {
  private readonly tokens: Token[] = [];
  private index = 0;
  /** Cosmos DB for NoSQL: "text" is a string literal (not a quoted identifier as in T-SQL). */
  private readonly doubleQuotedStrings: boolean;

  public constructor(input: string, options: { doubleQuotedStrings?: boolean } = {}) {
    this.doubleQuotedStrings = options.doubleQuotedStrings ?? false;
    this.scan(input);
    this.tokens.push({ kind: "eof", text: "<EOF>", position: input.length });
  }

  public peek(offset = 0): Token {
    return this.tokens[Math.min(this.index + offset, this.tokens.length - 1)] ?? this.tokens[this.tokens.length - 1]!;
  }

  public next(): Token {
    const token = this.peek();
    if (this.index < this.tokens.length - 1) this.index += 1;
    return token;
  }

  public mark(): number {
    return this.index;
  }

  public restore(mark: number): void {
    this.index = mark;
  }

  private scan(input: string): void {
    let i = 0;
    while (i < input.length) {
      const ch = input[i]!;
      if (/\s/u.test(ch)) {
        i += 1;
        continue;
      }
      if (ch === "-" && input[i + 1] === "-") {
        i += 2;
        while (i < input.length && input[i] !== "\n") i += 1;
        continue;
      }
      if (ch === "/" && input[i + 1] === "*") {
        const end = input.indexOf("*/", i + 2);
        i = end < 0 ? input.length : end + 2;
        continue;
      }
      if (ch === "'" || (/[Nn]/u.test(ch) && input[i + 1] === "'")) {
        const start = i;
        if (ch !== "'") i += 1;
        i += 1;
        let value = "";
        while (i < input.length) {
          if (input[i] === "'") {
            if (input[i + 1] === "'") {
              value += "'";
              i += 2;
              continue;
            }
            i += 1;
            break;
          }
          value += input[i]!;
          i += 1;
        }
        this.tokens.push({ kind: "string", text: input.slice(start, i), value, position: start });
        continue;
      }
      if (ch === '"' && this.doubleQuotedStrings) {
        const start = i;
        i += 1;
        let value = "";
        while (i < input.length) {
          if (input[i] === "\\" && i + 1 < input.length) {
            value += input[i + 1]!;
            i += 2;
            continue;
          }
          if (input[i] === '"') {
            i += 1;
            break;
          }
          value += input[i]!;
          i += 1;
        }
        this.tokens.push({ kind: "string", text: input.slice(start, i), value, position: start });
        continue;
      }
      if (ch === "[" || ch === '"') {
        const start = i;
        const close = ch === "[" ? "]" : '"';
        i += 1;
        let value = "";
        while (i < input.length) {
          if (input[i] === close) {
            if (input[i + 1] === close) {
              value += close;
              i += 2;
              continue;
            }
            i += 1;
            break;
          }
          value += input[i]!;
          i += 1;
        }
        this.tokens.push({ kind: "identifier", text: value, value, position: start, quoted: true });
        continue;
      }
      if (/[0-9]/u.test(ch) || (ch === "." && /[0-9]/u.test(input[i + 1] ?? ""))) {
        const start = i;
        i += 1;
        while (/[0-9]/u.test(input[i] ?? "")) i += 1;
        if (input[i] === ".") {
          i += 1;
          while (/[0-9]/u.test(input[i] ?? "")) i += 1;
        }
        this.tokens.push({ kind: "number", text: input.slice(start, i), value: Number(input.slice(start, i)), position: start });
        continue;
      }
      if (/[A-Za-z_@#]/u.test(ch)) {
        const start = i;
        i += 1;
        while (/[A-Za-z0-9_@$#]/u.test(input[i] ?? "")) i += 1;
        this.tokens.push({ kind: "identifier", text: input.slice(start, i), position: start });
        continue;
      }
      const two = input.slice(i, i + 2);
      if (["<>", "!=", "<=", ">="].includes(two)) {
        this.tokens.push({ kind: "symbol", text: two, position: i });
        i += 2;
        continue;
      }
      if ("(),;.*+-/%=<>".includes(ch)) {
        this.tokens.push({ kind: "symbol", text: ch, position: i });
        i += 1;
        continue;
      }
      this.tokens.push({ kind: "symbol", text: ch, position: i });
      i += 1;
    }
  }
}

class Parser {
  public constructor(private readonly tokenizer: Tokenizer) {}

  public parseBatch(): Statement[] {
    const statements: Statement[] = [];
    while (!this.isEof()) {
      if (this.consumeSymbol(";")) continue;
      statements.push(this.parseStatement());
      this.consumeSymbol(";");
    }
    return statements;
  }

  private parseStatement(): Statement {
    const token = this.peek();
    if (!this.isIdentifier(token)) throw this.syntax(token);
    if (this.consumeKeyword("CREATE")) return this.parseCreate();
    if (this.consumeKeyword("DROP")) return this.parseDrop();
    if (this.consumeKeyword("INSERT")) return this.parseInsert();
    if (this.consumeKeyword("SELECT")) return this.parseSelectAfterSelect();
    if (this.consumeKeyword("UPDATE")) return this.parseUpdate();
    if (this.consumeKeyword("DELETE")) return this.parseDelete();
    throw new SqlError(`The statement '${token.text.toUpperCase()}' is not supported in this simulation.`);
  }

  private parseCreate(): Statement {
    if (!this.consumeKeyword("TABLE")) throw this.unsupportedOrSyntax("CREATE");
    const name = this.parseName();
    this.expectSymbol("(");
    const columns: ColumnDef[] = [];
    const tablePrimary: string[] = [];
    while (!this.consumeSymbol(")")) {
      if (this.consumeKeyword("PRIMARY")) {
        this.expectKeyword("KEY");
        this.expectSymbol("(");
        do tablePrimary.push(this.parseIdentifier());
        while (this.consumeSymbol(","));
        this.expectSymbol(")");
      } else {
        const colName = this.parseIdentifier();
        const type = this.parseType();
        let notNull = false;
        let primaryKey = false;
        let identity = false;
        while (!this.checkSymbol(",") && !this.checkSymbol(")") && !this.isEof()) {
          if (this.consumeKeyword("NOT")) {
            this.expectKeyword("NULL");
            notNull = true;
          } else if (this.consumeKeyword("NULL")) {
            notNull = false;
          } else if (this.consumeKeyword("PRIMARY")) {
            this.expectKeyword("KEY");
            primaryKey = true;
            notNull = true;
          } else if (this.consumeKeyword("IDENTITY")) {
            if (this.consumeSymbol("(")) {
              this.expectNumber();
              this.expectSymbol(",");
              this.expectNumber();
              this.expectSymbol(")");
            }
            identity = true;
            notNull = true;
          } else {
            throw this.syntax(this.peek());
          }
        }
        columns.push({ name: colName, typeName: type.typeName, notNull, primaryKey, identity, length: type.length });
      }
      if (!this.consumeSymbol(",")) this.expectSymbol(")");
      else if (this.checkSymbol(")")) throw this.syntax(this.peek());
      else continue;
      break;
    }
    for (const pk of tablePrimary) {
      const col = columns.find((c) => sameName(c.name, pk));
      if (!col) throw new SqlError(`Invalid column name '${pk}'.`);
      col.primaryKey = true;
      col.notNull = true;
    }
    return { type: "create", name, columns };
  }

  private parseType(): { typeName: string; length?: number } {
    const name = this.parseIdentifier().toUpperCase();
    const allowed = new Set([
      "INT",
      "INTEGER",
      "BIGINT",
      "SMALLINT",
      "TINYINT",
      "DECIMAL",
      "NUMERIC",
      "MONEY",
      "FLOAT",
      "REAL",
      "NVARCHAR",
      "VARCHAR",
      "NCHAR",
      "CHAR",
      "TEXT",
      "NTEXT",
      "DATE",
      "DATETIME",
      "DATETIME2",
      "BIT",
      "UNIQUEIDENTIFIER",
    ]);
    if (!allowed.has(name)) throw this.syntax(this.peek(-1));
    let suffix = "";
    let length: number | undefined;
    if (this.consumeSymbol("(")) {
      if (this.consumeKeyword("MAX")) {
        suffix = "(MAX)";
      } else {
        const n = this.expectNumber();
        suffix = `(${n}`;
        if (["NVARCHAR", "VARCHAR", "NCHAR", "CHAR"].includes(name)) length = n;
        if (this.consumeSymbol(",")) {
          const scale = this.expectNumber();
          suffix += `,${scale}`;
        }
        suffix += ")";
      }
      this.expectSymbol(")");
    }
    return { typeName: `${name}${suffix}`, length };
  }

  private parseDrop(): Statement {
    this.expectKeyword("TABLE");
    let ifExists = false;
    if (this.consumeKeyword("IF")) {
      this.expectKeyword("EXISTS");
      ifExists = true;
    }
    return { type: "drop", name: this.parseName(), ifExists };
  }

  private parseInsert(): Statement {
    this.expectKeyword("INTO");
    const name = this.parseName();
    let columns: string[] | undefined;
    if (this.consumeSymbol("(")) {
      columns = [];
      do columns.push(this.parseIdentifier());
      while (this.consumeSymbol(","));
      this.expectSymbol(")");
    }
    this.expectKeyword("VALUES");
    const rows: Expr[][] = [];
    do {
      this.expectSymbol("(");
      const values: Expr[] = [];
      if (!this.checkSymbol(")")) {
        do values.push(this.parseExpression());
        while (this.consumeSymbol(","));
      }
      this.expectSymbol(")");
      rows.push(values);
    } while (this.consumeSymbol(","));
    return { type: "insert", name, columns, rows };
  }

  private parseSelectAfterSelect(): SelectStmt {
    const distinct = this.consumeKeyword("DISTINCT");
    let top: number | undefined;
    if (this.consumeKeyword("TOP")) {
      if (this.consumeSymbol("(")) {
        top = this.expectNumber();
        this.expectSymbol(")");
      } else {
        top = this.expectNumber();
      }
    }
    const items: SelectItem[] = [];
    do {
      if (this.peek().kind === "identifier" && this.isClauseKeyword(this.peek().text)) throw this.syntax(this.peek());
      const value = this.consumeKeyword("VALUE");
      if (this.consumeSymbol("*")) {
        items.push({ star: true, value });
      } else {
        const mark = this.tokenizer.mark();
        if (this.peek().kind === "identifier" && this.peek(1).text === "." && this.peek(2).text === "*") {
          const alias = this.parseIdentifier();
          this.expectSymbol(".");
          this.expectSymbol("*");
          items.push({ tableStar: alias, value });
        } else {
          this.tokenizer.restore(mark);
          const expr = this.parseExpression();
          let alias: string | undefined;
          if (this.consumeKeyword("AS")) alias = this.parseIdentifier();
          else if (this.peek().kind === "identifier" && !this.isClauseKeyword(this.peek().text)) alias = this.parseIdentifier();
          items.push({ expr, alias, value });
        }
      }
    } while (this.consumeSymbol(","));

    let from: TableRef | undefined;
    const joins: Join[] = [];
    if (this.consumeKeyword("FROM")) {
      from = this.parseTableRef();
      while (true) {
        let kind: "inner" | "left" | undefined;
        if (this.consumeKeyword("JOIN")) kind = "inner";
        else if (this.consumeKeyword("INNER")) {
          this.expectKeyword("JOIN");
          kind = "inner";
        } else if (this.consumeKeyword("LEFT")) {
          this.consumeKeyword("OUTER");
          this.expectKeyword("JOIN");
          kind = "left";
        }
        if (!kind) break;
        const table = this.parseTableRef();
        this.expectKeyword("ON");
        joins.push({ kind, table, on: this.parseExpression() });
      }
    }
    const where = this.consumeKeyword("WHERE") ? this.parseExpression() : undefined;
    const groupBy: Expr[] = [];
    if (this.consumeKeyword("GROUP")) {
      this.expectKeyword("BY");
      do groupBy.push(this.parseExpression());
      while (this.consumeSymbol(","));
    }
    const having = this.consumeKeyword("HAVING") ? this.parseExpression() : undefined;
    const orderBy: OrderItem[] = [];
    if (this.consumeKeyword("ORDER")) {
      this.expectKeyword("BY");
      do {
        const expr = this.parseExpression();
        const direction = this.consumeKeyword("DESC") ? "DESC" : (this.consumeKeyword("ASC"), "ASC");
        orderBy.push({ expr, direction });
      } while (this.consumeSymbol(","));
    }
    let offset: number | undefined;
    let fetch: number | undefined;
    if (this.consumeKeyword("OFFSET")) {
      offset = this.expectNumber();
      this.expectKeyword("ROWS");
      if (this.consumeKeyword("FETCH")) {
        if (!this.consumeKeyword("NEXT")) this.consumeKeyword("FIRST");
        fetch = this.expectNumber();
        this.expectKeyword("ROWS");
        this.consumeKeyword("ONLY");
      }
    }
    const limit = this.consumeKeyword("LIMIT") ? this.expectNumber() : undefined;
    return { type: "select", distinct, top, items, from, joins, where, groupBy, having, orderBy, offset, fetch, limit };
  }

  private parseTableRef(): TableRef {
    const name = this.parseName();
    let alias: string | undefined;
    if (this.consumeKeyword("AS")) alias = this.parseIdentifier();
    else if (this.peek().kind === "identifier" && !this.isClauseKeyword(this.peek().text)) alias = this.parseIdentifier();
    return { name, alias };
  }

  private parseUpdate(): Statement {
    const name = this.parseName();
    this.expectKeyword("SET");
    const assignments: { column: string; expr: Expr }[] = [];
    do {
      const column = this.parseIdentifier();
      this.expectSymbol("=");
      assignments.push({ column, expr: this.parseExpression() });
    } while (this.consumeSymbol(","));
    const where = this.consumeKeyword("WHERE") ? this.parseExpression() : undefined;
    return { type: "update", name, assignments, where };
  }

  private parseDelete(): Statement {
    this.consumeKeyword("FROM");
    const name = this.parseName();
    const where = this.consumeKeyword("WHERE") ? this.parseExpression() : undefined;
    return { type: "delete", name, where };
  }

  private parseExpression(): Expr {
    return this.parseOr();
  }

  private parseOr(): Expr {
    let expr = this.parseAnd();
    while (this.consumeKeyword("OR")) expr = { type: "binary", op: "OR", left: expr, right: this.parseAnd() };
    return expr;
  }

  private parseAnd(): Expr {
    let expr = this.parseNot();
    while (this.consumeKeyword("AND")) expr = { type: "binary", op: "AND", left: expr, right: this.parseNot() };
    return expr;
  }

  private parseNot(): Expr {
    if (this.consumeKeyword("NOT")) return { type: "unary", op: "NOT", expr: this.parseNot() };
    return this.parsePredicate();
  }

  private parsePredicate(): Expr {
    let expr = this.parseComparison();
    if (this.consumeKeyword("IS")) {
      const not = this.consumeKeyword("NOT");
      this.expectKeyword("NULL");
      expr = { type: "isNull", expr, not };
    } else {
      const not = this.consumeKeyword("NOT");
      if (this.consumeKeyword("IN")) {
        this.expectSymbol("(");
        const values: Expr[] = [];
        if (!this.checkSymbol(")")) {
          do values.push(this.parseExpression());
          while (this.consumeSymbol(","));
        }
        this.expectSymbol(")");
        expr = { type: "in", expr, values, not };
      } else if (this.consumeKeyword("BETWEEN")) {
        const low = this.parseComparison();
        this.expectKeyword("AND");
        expr = { type: "between", expr, low, high: this.parseComparison(), not };
      } else if (this.consumeKeyword("LIKE")) {
        expr = { type: "like", expr, pattern: this.parseComparison(), not };
      } else if (not) {
        throw this.syntax(this.peek());
      }
    }
    return expr;
  }

  private parseComparison(): Expr {
    let expr = this.parseAdditive();
    while (["=", "<>", "!=", "<", ">", "<=", ">="].includes(this.peek().text)) {
      const op = this.next().text as BinaryOp;
      expr = { type: "binary", op, left: expr, right: this.parseAdditive() };
    }
    return expr;
  }

  private parseAdditive(): Expr {
    let expr = this.parseMultiplicative();
    while (this.checkSymbol("+") || this.checkSymbol("-")) {
      const op = this.next().text as "+" | "-";
      expr = { type: "binary", op, left: expr, right: this.parseMultiplicative() };
    }
    return expr;
  }

  private parseMultiplicative(): Expr {
    let expr = this.parseUnary();
    while (this.checkSymbol("*") || this.checkSymbol("/") || this.checkSymbol("%")) {
      const op = this.next().text as "*" | "/" | "%";
      expr = { type: "binary", op, left: expr, right: this.parseUnary() };
    }
    return expr;
  }

  private parseUnary(): Expr {
    if (this.consumeSymbol("-")) return { type: "unary", op: "NEG", expr: this.parseUnary() };
    return this.parsePrimary();
  }

  private parsePrimary(): Expr {
    const token = this.peek();
    if (this.consumeSymbol("(")) {
      const expr = this.parseExpression();
      this.expectSymbol(")");
      return expr;
    }
    if (token.kind === "number") {
      this.next();
      return { type: "literal", value: token.value };
    }
    if (token.kind === "string") {
      this.next();
      return { type: "literal", value: token.value };
    }
    if (this.consumeKeyword("NULL")) return { type: "literal", value: null };
    if (this.consumeKeyword("TRUE")) return { type: "literal", value: true };
    if (this.consumeKeyword("FALSE")) return { type: "literal", value: false };
    if (token.kind === "identifier") {
      const first = this.parseIdentifier();
      if (this.consumeSymbol("(")) {
        if (sameName(first, "GETDATE")) throw new SqlError("GETDATE is not available in this simulation.");
        let distinct = false;
        let star = false;
        const args: Expr[] = [];
        if (this.consumeSymbol("*")) star = true;
        else if (!this.checkSymbol(")")) {
          distinct = this.consumeKeyword("DISTINCT");
          do args.push(this.parseExpression());
          while (this.consumeSymbol(","));
        }
        this.expectSymbol(")");
        return { type: "call", name: first.toUpperCase(), args, distinct, star };
      }
      const parts = [first];
      while (this.consumeSymbol(".")) parts.push(this.parseIdentifier());
      while (this.peek().kind === "identifier" && this.peek().quoted && /^["']/u.test(this.peek().text)) {
        parts.push(this.parseIdentifier());
      }
      return { type: "column", parts };
    }
    throw this.syntax(token);
  }

  private parseName(): string {
    const parts = [this.parseIdentifier()];
    while (this.consumeSymbol(".")) parts.push(this.parseIdentifier());
    return parts.join(".");
  }

  private parseIdentifier(): string {
    const token = this.peek();
    if (token.kind !== "identifier") throw this.syntax(token);
    this.next();
    const raw = String(token.value ?? token.text);
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) return raw.slice(1, -1);
    return raw;
  }

  private expectKeyword(keyword: string): void {
    if (!this.consumeKeyword(keyword)) throw this.syntax(this.peek());
  }

  private expectSymbol(symbol: string): void {
    if (!this.consumeSymbol(symbol)) throw this.syntax(this.peek());
  }

  private expectNumber(): number {
    const token = this.peek();
    if (token.kind !== "number" || typeof token.value !== "number" || !Number.isFinite(token.value)) throw this.syntax(token);
    this.next();
    return token.value;
  }

  private consumeKeyword(keyword: string): boolean {
    const token = this.peek();
    if (this.isIdentifier(token) && sameName(token.text, keyword)) {
      this.next();
      return true;
    }
    return false;
  }

  private consumeSymbol(symbol: string): boolean {
    if (this.checkSymbol(symbol)) {
      this.next();
      return true;
    }
    return false;
  }

  private checkSymbol(symbol: string): boolean {
    return this.peek().text === symbol;
  }

  private isIdentifier(token: Token): boolean {
    return token.kind === "identifier";
  }

  private isEof(): boolean {
    return this.peek().kind === "eof";
  }

  private peek(offset = 0): Token {
    return this.tokenizer.peek(offset);
  }

  private next(): Token {
    return this.tokenizer.next();
  }

  private syntax(token: Token): SqlError {
    return new SqlError(`Incorrect syntax near '${token.kind === "eof" ? "<EOF>" : token.text}'.`);
  }

  private unsupportedOrSyntax(keyword: string): SqlError {
    const next = this.peek();
    if (next.kind === "identifier") return new SqlError(`The statement '${keyword}' is not supported in this simulation.`);
    return this.syntax(next);
  }

  private isClauseKeyword(text: string): boolean {
    return [
      "FROM",
      "WHERE",
      "GROUP",
      "HAVING",
      "ORDER",
      "OFFSET",
      "FETCH",
      "LIMIT",
      "JOIN",
      "INNER",
      "LEFT",
      "ON",
      "UNION",
      "VALUES",
      "SET",
    ].some((kw) => sameName(kw, text));
  }
}

function sameName(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b);
}

function findTableKey(db: SqlDatabase, name: string, defaultTable?: string): { key: string; documentAlias: boolean } | undefined {
  const direct = Object.keys(db.tables).find((key) => sameName(key, name));
  if (direct) return { key: direct, documentAlias: false };
  const withoutDbo = name.replace(/^dbo\./iu, "");
  if (withoutDbo !== name) {
    const key = Object.keys(db.tables).find((k) => sameName(k, withoutDbo));
    if (key) return { key, documentAlias: false };
  }
  if (defaultTable) {
    const key = Object.keys(db.tables).find((k) => sameName(k, defaultTable));
    if (key) return { key, documentAlias: true };
  }
  return undefined;
}

function columnValue(row: Record<string, unknown> | undefined, name: string): { found: boolean; key: string; value: unknown } {
  if (!row) return { found: false, key: name, value: undefined };
  const key = Object.keys(row).find((k) => sameName(k, name));
  if (!key) return { found: false, key: name, value: undefined };
  return { found: true, key, value: row[key] };
}

function buildScope(entries: { alias: string; row: Record<string, unknown> | undefined; table: SqlTable }[]): ScopeRow {
  const sources: Record<string, Record<string, unknown> | undefined> = {};
  const columns = new Map<string, { value: unknown; display: string; count: number }>();
  for (const entry of entries) {
    sources[normalizeName(entry.alias)] = entry.row;
    const names = entry.table.columns?.map((c) => c.name) ?? Object.keys(entry.row ?? {});
    for (const declared of names) {
      const value = columnValue(entry.row, declared);
      const key = normalizeName(declared);
      const existing = columns.get(key);
      columns.set(key, { value: value.value, display: value.key, count: (existing?.count ?? 0) + 1 });
    }
  }
  return { sources, columns };
}

function truthy(value: unknown): boolean | undefined {
  if (value === null || value === undefined) return undefined;
  return Boolean(value);
}

function compareValues(left: unknown, right: unknown, caseSensitive: boolean): number | undefined {
  if (left === null || left === undefined || right === null || right === undefined) return undefined;
  if (typeof left === "number" && typeof right === "number") return left === right ? 0 : left < right ? -1 : 1;
  const a = String(left);
  const b = String(right);
  const aa = caseSensitive ? a : a.toLocaleLowerCase();
  const bb = caseSensitive ? b : b.toLocaleLowerCase();
  return aa === bb ? 0 : aa < bb ? -1 : 1;
}

function evalExpr(expr: Expr, row: ScopeRow, options: EvalOptions): unknown {
  switch (expr.type) {
    case "literal":
      return expr.value;
    case "column":
      return evalColumn(expr.parts, row, options);
    case "unary": {
      const v = evalExpr(expr.expr, row, options);
      if (expr.op === "NEG") return v === null || v === undefined ? null : -Number(v);
      const t = truthy(v);
      return t === undefined ? undefined : !t;
    }
    case "binary":
      return evalBinary(expr, row, options);
    case "isNull": {
      const v = evalExpr(expr.expr, row, options);
      const isNull = v === null || v === undefined;
      return expr.not ? !isNull : isNull;
    }
    case "between": {
      const v = evalExpr(expr.expr, row, options);
      const low = compareValues(v, evalExpr(expr.low, row, options), options.caseSensitiveStrings);
      const high = compareValues(v, evalExpr(expr.high, row, options), options.caseSensitiveStrings);
      const res = low === undefined || high === undefined ? undefined : low >= 0 && high <= 0;
      return expr.not ? (res === undefined ? undefined : !res) : res;
    }
    case "in": {
      const v = evalExpr(expr.expr, row, options);
      if (v === null || v === undefined) return undefined;
      let hasNull = false;
      for (const item of expr.values) {
        const other = evalExpr(item, row, options);
        if (other === null || other === undefined) hasNull = true;
        else if (compareValues(v, other, options.caseSensitiveStrings) === 0) return expr.not ? false : true;
      }
      return hasNull ? undefined : expr.not;
    }
    case "like": {
      const v = evalExpr(expr.expr, row, options);
      const pattern = evalExpr(expr.pattern, row, options);
      if (v === null || v === undefined || pattern === null || pattern === undefined) return undefined;
      const ok = like(String(v), String(pattern), options.caseSensitiveStrings);
      return expr.not ? !ok : ok;
    }
    case "call":
      return evalCall(expr, row, options);
  }
}

function evalColumn(parts: string[], row: ScopeRow, options: EvalOptions): unknown {
  if (parts.length === 1) {
    const name = parts[0]!;
    const groupValue = options.groupValues?.get(normalizeName(name));
    if (groupValue !== undefined || options.groupValues?.has(normalizeName(name))) return groupValue;
    const found = row.columns.get(normalizeName(name));
    if (!found) throw new SqlError(`Invalid column name '${name}'.`);
    if (found.count > 1) throw new SqlError(`Ambiguous column name '${name}'.`);
    return found.value;
  }
  const [first, ...rest] = parts;
  const source = row.sources[normalizeName(first!)];
  if (source === undefined && !(normalizeName(first!) in row.sources)) throw new SqlError(`Invalid column name '${parts.join(".")}'.`);
  let current: unknown = source;
  for (const part of rest) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    const obj = current as Record<string, unknown>;
    const key = Object.keys(obj).find((k) => sameName(k, part)) ?? part;
    current = obj[key];
  }
  return current;
}

function evalBinary(expr: Extract<Expr, { type: "binary" }>, row: ScopeRow, options: EvalOptions): unknown {
  if (expr.op === "AND") {
    const l = truthy(evalExpr(expr.left, row, options));
    if (l === false) return false;
    const r = truthy(evalExpr(expr.right, row, options));
    if (r === false) return false;
    return l === true && r === true ? true : undefined;
  }
  if (expr.op === "OR") {
    const l = truthy(evalExpr(expr.left, row, options));
    if (l === true) return true;
    const r = truthy(evalExpr(expr.right, row, options));
    if (r === true) return true;
    return l === false && r === false ? false : undefined;
  }
  const left = evalExpr(expr.left, row, options);
  const right = evalExpr(expr.right, row, options);
  if (["=", "<>", "!=", "<", ">", "<=", ">="].includes(expr.op)) {
    const cmp = compareValues(left, right, options.caseSensitiveStrings);
    if (cmp === undefined) return undefined;
    switch (expr.op) {
      case "=":
        return cmp === 0;
      case "<>":
      case "!=":
        return cmp !== 0;
      case "<":
        return cmp < 0;
      case ">":
        return cmp > 0;
      case "<=":
        return cmp <= 0;
      case ">=":
        return cmp >= 0;
    }
  }
  if (left === null || left === undefined || right === null || right === undefined) return null;
  if (expr.op === "+" && (typeof left === "string" || typeof right === "string")) return `${left}${right}`;
  const l = Number(left);
  const r = Number(right);
  switch (expr.op) {
    case "+":
      return l + r;
    case "-":
      return l - r;
    case "*":
      return l * r;
    case "/":
      return r === 0 ? null : l / r;
    case "%":
      return r === 0 ? null : l % r;
    default:
      return null;
  }
}

function evalCall(expr: Extract<Expr, { type: "call" }>, row: ScopeRow, options: EvalOptions): unknown {
  const name = expr.name.toUpperCase();
  if (isAggregate(name)) return evalAggregate(expr, row, options);
  const values = expr.args.map((arg) => evalExpr(arg, row, options));
  switch (name) {
    case "UPPER":
      return values[0] == null ? null : String(values[0]).toLocaleUpperCase();
    case "LOWER":
      return values[0] == null ? null : String(values[0]).toLocaleLowerCase();
    case "LEN":
    case "LENGTH":
      return values[0] == null ? null : String(values[0]).length;
    case "ROUND":
      return values[0] == null ? null : round(Number(values[0]), Number(values[1] ?? 0));
    case "ABS":
      return values[0] == null ? null : Math.abs(Number(values[0]));
    case "CONCAT":
      return values.map((v) => (v == null ? "" : String(v))).join("");
    case "SUBSTRING": {
      const s = values[0] == null ? "" : String(values[0]);
      const start = Math.max(1, Number(values[1] ?? 1));
      const len = Number(values[2] ?? s.length);
      return s.slice(start - 1, start - 1 + len);
    }
    case "IS_DEFINED":
      return values[0] !== undefined;
    case "ARRAY_CONTAINS":
      return Array.isArray(values[0]) && values[0].some((v) => compareValues(v, values[1], options.caseSensitiveStrings) === 0);
    case "CONTAINS":
      return values[0] != null && values[1] != null && String(values[0]).includes(String(values[1]));
    case "STARTSWITH":
      return values[0] != null && values[1] != null && String(values[0]).startsWith(String(values[1]));
    default:
      throw new SqlError(`Incorrect syntax near '${expr.name}'.`);
  }
}

function evalAggregate(expr: Extract<Expr, { type: "call" }>, row: ScopeRow, options: EvalOptions): unknown {
  const rows = options.aggregateRows;
  if (!rows) throw new SqlError(`Incorrect syntax near '${expr.name}'.`);
  const values = expr.star ? rows.map(() => 1) : rows.map((r) => evalExpr(expr.args[0]!, r, { ...options, aggregateRows: undefined }));
  const filtered = values.filter((v) => v !== null && v !== undefined);
  const distinct = expr.distinct ? uniqueValues(filtered, options.caseSensitiveStrings) : filtered;
  switch (expr.name.toUpperCase()) {
    case "COUNT":
      return expr.star ? rows.length : distinct.length;
    case "SUM":
      return distinct.length === 0 ? null : distinct.reduce<number>((sum, v) => sum + Number(v), 0);
    case "AVG":
      return distinct.length === 0 ? null : distinct.reduce<number>((sum, v) => sum + Number(v), 0) / distinct.length;
    case "MIN":
      return minMax(distinct, options.caseSensitiveStrings, "min");
    case "MAX":
      return minMax(distinct, options.caseSensitiveStrings, "max");
    default:
      return null;
  }
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function isAggregate(name: string): boolean {
  return ["COUNT", "SUM", "AVG", "MIN", "MAX"].includes(name.toUpperCase());
}

function exprHasAggregate(expr: Expr): boolean {
  switch (expr.type) {
    case "call":
      return isAggregate(expr.name) || expr.args.some(exprHasAggregate);
    case "binary":
      return exprHasAggregate(expr.left) || exprHasAggregate(expr.right);
    case "unary":
    case "isNull":
      return exprHasAggregate(expr.expr);
    case "between":
      return exprHasAggregate(expr.expr) || exprHasAggregate(expr.low) || exprHasAggregate(expr.high);
    case "in":
      return exprHasAggregate(expr.expr) || expr.values.some(exprHasAggregate);
    case "like":
      return exprHasAggregate(expr.expr) || exprHasAggregate(expr.pattern);
    default:
      return false;
  }
}

function uniqueValues(values: unknown[], caseSensitive: boolean): unknown[] {
  const out: unknown[] = [];
  for (const value of values) {
    if (!out.some((v) => compareValues(v, value, caseSensitive) === 0)) out.push(value);
  }
  return out;
}

function minMax(values: unknown[], caseSensitive: boolean, mode: "min" | "max"): unknown {
  if (values.length === 0) return null;
  let best = values[0];
  for (const value of values.slice(1)) {
    const cmp = compareValues(value, best, caseSensitive);
    if (cmp !== undefined && (mode === "min" ? cmp < 0 : cmp > 0)) best = value;
  }
  return best;
}

function like(value: string, pattern: string, caseSensitive: boolean): boolean {
  let regex = "^";
  for (const ch of pattern) {
    if (ch === "%") regex += ".*";
    else if (ch === "_") regex += ".";
    else regex += ch.replace(/[\\^$.*+?()[\]{}|]/gu, "\\$&");
  }
  regex += "$";
  return new RegExp(regex, caseSensitive ? "u" : "iu").test(value);
}

function coerceValue(value: unknown, column: SqlColumn): unknown {
  if (value === undefined || value === null) {
    if (column.notNull || column.primaryKey) throw new SqlError(`Cannot insert the value NULL into column '${column.name}'.`);
    return null;
  }
  const type = column.type.toUpperCase();
  if (type.includes("CHAR") || type === "TEXT" || type === "NTEXT" || type === "UNIQUEIDENTIFIER") {
    const s = String(value);
    const length = declaredLength(type);
    if (length !== undefined && s.length > length) throw new SqlError("String or binary data would be truncated.");
    return s;
  }
  if (type === "BIT") {
    if (typeof value === "boolean") return value ? 1 : 0;
    const s = String(value).toLocaleLowerCase();
    if (s === "true") return 1;
    if (s === "false") return 0;
    const n = Number(value);
    if (n === 0 || n === 1) return n;
    throw new SqlError(`Conversion failed when converting the value '${String(value)}' to data type bit.`);
  }
  if (["INT", "INTEGER", "BIGINT", "SMALLINT", "TINYINT", "DECIMAL", "NUMERIC", "MONEY", "FLOAT", "REAL"].some((t) => type.startsWith(t))) {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new SqlError(`Conversion failed when converting the value '${String(value)}' to data type ${column.type}.`);
    return n;
  }
  if (type.startsWith("DATE")) return String(value);
  return value;
}

function declaredLength(type: string): number | undefined {
  const match = /\((\d+)\)/u.exec(type);
  return match ? Number(match[1]) : undefined;
}

function ensurePrimaryKey(table: SqlTable, candidate: Record<string, unknown>, ignoreIndex?: number): void {
  const pks = table.columns?.filter((c) => c.primaryKey) ?? [];
  if (pks.length === 0) return;
  for (let i = 0; i < table.rows.length; i += 1) {
    if (i === ignoreIndex) continue;
    const row = table.rows[i]!;
    if (pks.every((pk) => compareValues(columnValue(row, pk.name).value, columnValue(candidate, pk.name).value, false) === 0)) {
      throw new SqlError("Violation of PRIMARY KEY constraint. Cannot insert duplicate key in object.");
    }
  }
}

function resolveColumn(table: SqlTable, name: string): SqlColumn | undefined {
  return table.columns?.find((c) => sameName(c.name, name));
}

function executeStatement(db: SqlDatabase, stmt: Statement, options: SqlOptions): SqlResult {
  switch (stmt.type) {
    case "create":
      return executeCreate(db, stmt);
    case "drop":
      return executeDrop(db, stmt);
    case "insert":
      return executeInsert(db, stmt);
    case "select":
      return executeSelect(db, stmt, options);
    case "update":
      return executeUpdate(db, stmt);
    case "delete":
      return executeDelete(db, stmt);
  }
}

function executeCreate(db: SqlDatabase, stmt: Extract<Statement, { type: "create" }>): SqlResult {
  if (findTableKey(db, stmt.name)) throw new SqlError(`There is already an object named '${stmt.name}' in the database.`);
  const table: SqlTable = {
    columns: stmt.columns.map((c) => ({ name: c.name, type: c.typeName, notNull: c.notNull, primaryKey: c.primaryKey })),
    rows: [],
  };
  const identity = stmt.columns.find((c) => c.identity);
  if (identity) (table as SqlTable & { identity?: string }).identity = identity.name;
  db.tables[stmt.name] = table;
  return { ok: true, kind: "affected", rowCount: 0, message: "Commands completed successfully.", database: db };
}

function tableIdentity(table: SqlTable): string | undefined {
  return (table as SqlTable & { identity?: string }).identity;
}

function executeDrop(db: SqlDatabase, stmt: Extract<Statement, { type: "drop" }>): SqlResult {
  const found = findTableKey(db, stmt.name);
  if (!found) {
    if (stmt.ifExists) return { ok: true, kind: "affected", rowCount: 0, message: "Commands completed successfully.", database: db };
    throw new SqlError(`Invalid object name '${stmt.name}'.`);
  }
  delete db.tables[found.key];
  return { ok: true, kind: "affected", rowCount: 0, message: "Commands completed successfully.", database: db };
}

function executeInsert(db: SqlDatabase, stmt: Extract<Statement, { type: "insert" }>): SqlResult {
  const found = findTableKey(db, stmt.name);
  if (!found) throw new SqlError(`Invalid object name '${stmt.name}'.`);
  const table = db.tables[found.key]!;
  let affected = 0;
  for (const values of stmt.rows) {
    const row: Record<string, unknown> = {};
    const declared = table.columns;
    const targetNames = stmt.columns ?? declared?.filter((c) => tableIdentity(table) === undefined || !sameName(c.name, tableIdentity(table)!)).map((c) => c.name);
    if (targetNames && targetNames.length !== values.length) throw new SqlError("Column name or number of supplied values does not match table definition.");
    if (!targetNames && values.length === 0) throw new SqlError("Column name or number of supplied values does not match table definition.");
    const names = targetNames ?? values.map((_, i) => `Column${i + 1}`);
    for (let i = 0; i < names.length; i += 1) {
      const name = names[i]!;
      const col = resolveColumn(table, name);
      if (declared && !col) throw new SqlError(`Invalid column name '${name}'.`);
      const raw = evalExpr(values[i]!, buildScope([]), { caseSensitiveStrings: false });
      row[col?.name ?? name] = col ? coerceValue(raw, col) : raw;
    }
    if (declared) {
      for (const col of declared) {
        if (!(col.name in row)) {
          if (sameName(col.name, tableIdentity(table) ?? "")) row[col.name] = nextIdentity(table, col.name);
          else row[col.name] = coerceValue(null, col);
        }
      }
    }
    ensurePrimaryKey(table, row);
    if (table.rows.length >= 1000) throw new SqlError("Table row limit of 1000 exceeded.");
    table.rows.push(row);
    affected += 1;
  }
  return { ok: true, kind: "affected", rowCount: affected, message: affectedMessage(affected), database: db };
}

function nextIdentity(table: SqlTable, name: string): number {
  let max = 0;
  for (const row of table.rows) {
    const n = Number(columnValue(row, name).value);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

function executeUpdate(db: SqlDatabase, stmt: Extract<Statement, { type: "update" }>): SqlResult {
  const found = findTableKey(db, stmt.name);
  if (!found) throw new SqlError(`Invalid object name '${stmt.name}'.`);
  const table = db.tables[found.key]!;
  let affected = 0;
  for (let i = 0; i < table.rows.length; i += 1) {
    const row = table.rows[i]!;
    const scope = buildScope([{ alias: stmt.name.split(".").at(-1) ?? stmt.name, row, table }]);
    if (stmt.where && truthy(evalExpr(stmt.where, scope, { caseSensitiveStrings: false })) !== true) continue;
    const next = cloneRecord(row);
    for (const assignment of stmt.assignments) {
      const col = resolveColumn(table, assignment.column);
      if (table.columns && !col) throw new SqlError(`Invalid column name '${assignment.column}'.`);
      const value = evalExpr(assignment.expr, scope, { caseSensitiveStrings: false });
      next[col?.name ?? assignment.column] = col ? coerceValue(value, col) : value;
    }
    ensurePrimaryKey(table, next, i);
    table.rows[i] = next;
    affected += 1;
  }
  return { ok: true, kind: "affected", rowCount: affected, message: affectedMessage(affected), database: db };
}

function executeDelete(db: SqlDatabase, stmt: Extract<Statement, { type: "delete" }>): SqlResult {
  const found = findTableKey(db, stmt.name);
  if (!found) throw new SqlError(`Invalid object name '${stmt.name}'.`);
  const table = db.tables[found.key]!;
  const kept: Record<string, unknown>[] = [];
  let affected = 0;
  for (const row of table.rows) {
    const scope = buildScope([{ alias: stmt.name.split(".").at(-1) ?? stmt.name, row, table }]);
    if (!stmt.where || truthy(evalExpr(stmt.where, scope, { caseSensitiveStrings: false })) === true) affected += 1;
    else kept.push(row);
  }
  table.rows = kept;
  return { ok: true, kind: "affected", rowCount: affected, message: affectedMessage(affected), database: db };
}

function executeSelect(db: SqlDatabase, stmt: SelectStmt, options: SqlOptions): SqlResult {
  const maxRows = options.maxRows ?? 200;
  const documentQuery = stmt.from ? findTableKey(db, stmt.from.name, options.defaultTable)?.documentAlias === true : false;
  if (documentQuery) return executeDocumentSelect(db, stmt, options, maxRows);
  const scopes = buildRelationalRows(db, stmt);
  const rows = stmt.where ? scopes.filter((r) => truthy(evalExpr(stmt.where!, r, { caseSensitiveStrings: false })) === true) : scopes;
  const aggregate = stmt.groupBy.length > 0 || stmt.items.some((i) => i.expr && exprHasAggregate(i.expr)) || (stmt.having && exprHasAggregate(stmt.having));
  let projected: { values: SqlValue[]; orderScope: ScopeRow; aliases: Record<string, unknown> }[];
  const columns = selectColumns(stmt, rows[0], db);
  if (aggregate) {
    projected = aggregateProject(stmt, rows, columns);
  } else {
    validateNoAggregateMisuse(stmt, rows[0]);
    projected = rows.map((row) => projectRow(stmt, row, columns));
  }
  if (stmt.distinct) projected = distinctProjected(projected);
  projected = orderProjected(projected, stmt);
  projected = applyLimits(projected, stmt);
  const total = projected.length;
  projected = projected.slice(0, maxRows);
  return {
    ok: true,
    kind: "rows",
    columns,
    rows: projected.map((p) => p.values),
    rowCount: total,
    message: affectedMessage(total),
    database: db,
  };
}

function buildRelationalRows(db: SqlDatabase, stmt: SelectStmt): ScopeRow[] {
  if (!stmt.from) return [buildScope([])];
  const first = tableRows(db, stmt.from);
  let scopes = first.rows.map((row) => buildScope([{ alias: first.alias, row, table: first.table }]));
  for (const join of stmt.joins) {
    const right = tableRows(db, join.table);
    const next: ScopeRow[] = [];
    for (const left of scopes) {
      let matched = false;
      for (const r of right.rows) {
        const scope = mergeScope(left, buildScope([{ alias: right.alias, row: r, table: right.table }]));
        if (truthy(evalExpr(join.on, scope, { caseSensitiveStrings: false })) === true) {
          matched = true;
          next.push(scope);
        }
      }
      if (!matched && join.kind === "left") next.push(mergeScope(left, buildScope([{ alias: right.alias, row: undefined, table: right.table }])));
    }
    scopes = next;
  }
  return scopes;
}

function tableRows(db: SqlDatabase, ref: TableRef): { table: SqlTable; rows: Record<string, unknown>[]; alias: string } {
  const found = findTableKey(db, ref.name);
  if (!found) throw new SqlError(`Invalid object name '${ref.name}'.`);
  const table = db.tables[found.key]!;
  return { table, rows: table.rows, alias: ref.alias ?? ref.name.split(".").at(-1) ?? ref.name };
}

function mergeScope(a: ScopeRow, b: ScopeRow): ScopeRow {
  const sources = { ...a.sources, ...b.sources };
  const columns = new Map(a.columns);
  for (const [key, value] of b.columns) {
    const existing = columns.get(key);
    columns.set(key, { value: existing?.value ?? value.value, display: value.display, count: (existing?.count ?? 0) + value.count });
  }
  return { sources, columns };
}

function selectColumns(stmt: SelectStmt, sample?: ScopeRow, db?: SqlDatabase): string[] {
  const columns: string[] = [];
  for (const item of stmt.items) {
    if (item.star) {
      if (sample) for (const c of sample.columns.values()) if (c.count > 0) columns.push(c.display);
      else if (stmt.from && db) {
        const found = findTableKey(db, stmt.from.name);
        const table = found ? db.tables[found.key] : undefined;
        columns.push(...(table?.columns?.map((c) => c.name) ?? []));
      }
    } else if (item.tableStar) {
      const source = sample?.sources[normalizeName(item.tableStar)];
      for (const key of Object.keys(source ?? {})) columns.push(key);
    } else {
      columns.push(item.alias ?? expressionName(item.expr));
    }
  }
  return columns.length === 0 ? ["(No column name)"] : columns;
}

function expressionName(expr?: Expr): string {
  if (!expr) return "(No column name)";
  if (expr.type === "column") return expr.parts.at(-1) ?? "(No column name)";
  return "(No column name)";
}

function projectRow(stmt: SelectStmt, row: ScopeRow, columns: string[]): { values: SqlValue[]; orderScope: ScopeRow; aliases: Record<string, unknown> } {
  const values: SqlValue[] = [];
  const aliases: Record<string, unknown> = {};
  let colIndex = 0;
  for (const item of stmt.items) {
    if (item.star) {
      for (const c of row.columns.values()) {
        if (c.count > 0) {
          values.push(sqlValue(c.value));
          aliases[columns[colIndex]!] = c.value;
          colIndex += 1;
        }
      }
    } else if (item.tableStar) {
      const source = row.sources[normalizeName(item.tableStar)] ?? {};
      for (const value of Object.values(source)) {
        values.push(sqlValue(value));
        colIndex += 1;
      }
    } else {
      const value = evalExpr(item.expr!, row, { caseSensitiveStrings: false });
      values.push(sqlValue(value));
      aliases[columns[colIndex]!] = value;
      colIndex += 1;
    }
  }
  return { values, orderScope: row, aliases };
}

function aggregateProject(stmt: SelectStmt, rows: ScopeRow[], columns: string[]): { values: SqlValue[]; orderScope: ScopeRow; aliases: Record<string, unknown> }[] {
  const groups = new Map<string, { rows: ScopeRow[]; groupValues: Map<string, unknown> }>();
  if (stmt.groupBy.length === 0) {
    groups.set("", { rows, groupValues: new Map() });
  } else {
    for (const row of rows) {
      const values = stmt.groupBy.map((g) => evalExpr(g, row, { caseSensitiveStrings: false }));
      const key = JSON.stringify(values);
      if (!groups.has(key)) {
        const groupValues = new Map<string, unknown>();
        stmt.groupBy.forEach((g, i) => {
          if (g.type === "column") groupValues.set(normalizeName(g.parts.at(-1)!), values[i]);
        });
        groups.set(key, { rows: [], groupValues });
      }
      groups.get(key)!.rows.push(row);
    }
  }
  const out: { values: SqlValue[]; orderScope: ScopeRow; aliases: Record<string, unknown> }[] = [];
  for (const group of groups.values()) {
    const base = group.rows[0] ?? buildScope([]);
    const evalOptions: EvalOptions = { caseSensitiveStrings: false, aggregateRows: group.rows, groupValues: group.groupValues };
    if (stmt.having && truthy(evalExpr(stmt.having, base, evalOptions)) !== true) continue;
    const values: SqlValue[] = [];
    const aliases: Record<string, unknown> = {};
    stmt.items.forEach((item, i) => {
      if (item.star || item.tableStar) throw new SqlError("Incorrect syntax near '*'.");
      validateAggregateSelect(item.expr!, stmt.groupBy);
      const value = evalExpr(item.expr!, base, evalOptions);
      values.push(sqlValue(value));
      aliases[columns[i]!] = value;
    });
    out.push({ values, orderScope: base, aliases });
  }
  return out;
}

function validateNoAggregateMisuse(stmt: SelectStmt, sample?: ScopeRow): void {
  for (const item of stmt.items) if (item.expr && exprHasAggregate(item.expr)) evalExpr(item.expr, sample ?? buildScope([]), { caseSensitiveStrings: false });
}

function validateAggregateSelect(expr: Expr, groups: Expr[]): void {
  if (exprHasAggregate(expr)) return;
  if (groups.some((g) => JSON.stringify(g) === JSON.stringify(expr))) return;
  const name = expressionName(expr);
  throw new SqlError(`Column '${name}' is invalid in the select list because it is not contained in either an aggregate function or the GROUP BY clause.`);
}

function distinctProjected<T extends { values: SqlValue[] }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = JSON.stringify(item.values);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function orderProjected<T extends { values: SqlValue[]; orderScope: ScopeRow; aliases: Record<string, unknown> }>(items: T[], stmt: SelectStmt): T[] {
  if (stmt.orderBy.length === 0) return items;
  return [...items].sort((a, b) => {
    for (const order of stmt.orderBy) {
      const av = orderValue(order.expr, a, stmt);
      const bv = orderValue(order.expr, b, stmt);
      const cmp = compareValues(av, bv, false) ?? 0;
      if (cmp !== 0) return order.direction === "DESC" ? -cmp : cmp;
    }
    return 0;
  });
}

function orderValue(expr: Expr, item: { values: SqlValue[]; orderScope: ScopeRow; aliases: Record<string, unknown> }, _stmt: SelectStmt): unknown {
  if (expr.type === "literal" && typeof expr.value === "number") return item.values[Math.max(0, expr.value - 1)];
  if (expr.type === "column" && expr.parts.length === 1) {
    const alias = Object.keys(item.aliases).find((k) => sameName(k, expr.parts[0]!));
    if (alias) return item.aliases[alias];
  }
  return evalExpr(expr, item.orderScope, { caseSensitiveStrings: false });
}

function applyLimits<T>(rows: T[], stmt: SelectStmt): T[] {
  let out = rows;
  if (stmt.offset !== undefined) out = out.slice(stmt.offset);
  if (stmt.fetch !== undefined) out = out.slice(0, stmt.fetch);
  if (stmt.top !== undefined) out = out.slice(0, stmt.top);
  if (stmt.limit !== undefined) out = out.slice(0, stmt.limit);
  return out;
}

function executeDocumentSelect(db: SqlDatabase, stmt: SelectStmt, options: SqlOptions, maxRows: number): SqlResult {
  const found = findTableKey(db, stmt.from!.name, options.defaultTable);
  if (!found) throw new SqlError(`Invalid object name '${stmt.from!.name}'.`);
  const table = db.tables[found.key]!;
  const alias = stmt.from!.name;
  let scopes = table.rows.map((row) => buildScope([{ alias, row, table }]));
  if (stmt.where) scopes = scopes.filter((r) => truthy(evalExpr(stmt.where!, r, { caseSensitiveStrings: true })) === true);
  if (stmt.items.some((i) => i.expr && exprHasAggregate(i.expr))) {
    const base = scopes[0] ?? buildScope([]);
    const item = stmt.items[0]!;
    const value = evalExpr(item.expr!, base, { caseSensitiveStrings: true, aggregateRows: scopes });
    const docs = item.value ? [sqlValue(value)] : [{ [item.alias ?? expressionName(item.expr)]: sqlValue(value) }];
    return { ok: true, kind: "documents", documents: docs, rowCount: 1, message: affectedMessage(1), database: db };
  }
  let docs = scopes.map((scope) => projectDocument(stmt, scope, alias));
  docs = orderDocuments(docs, scopes, stmt);
  docs = applyLimits(docs, stmt);
  const total = docs.length;
  docs = docs.slice(0, maxRows);
  return { ok: true, kind: "documents", documents: docs, rowCount: total, message: affectedMessage(total), database: db };
}

function projectDocument(stmt: SelectStmt, scope: ScopeRow, alias: string): unknown {
  if (stmt.items.length === 1 && stmt.items[0]!.star) return cloneUnknown(scope.sources[normalizeName(alias)] ?? {});
  if (stmt.items.length === 1 && stmt.items[0]!.value) return cloneUnknown(evalExpr(stmt.items[0]!.expr!, scope, { caseSensitiveStrings: true }));
  const out: Record<string, unknown> = {};
  for (const item of stmt.items) {
    if (!item.expr) continue;
    const value = evalExpr(item.expr, scope, { caseSensitiveStrings: true });
    if (value !== undefined) out[item.alias ?? expressionName(item.expr)] = cloneUnknown(value);
  }
  return out;
}

function orderDocuments(docs: unknown[], scopes: ScopeRow[], stmt: SelectStmt): unknown[] {
  if (stmt.orderBy.length === 0) return docs;
  return docs
    .map((doc, i) => ({ doc, scope: scopes[i]! }))
    .sort((a, b) => {
      for (const order of stmt.orderBy) {
        const cmp = compareValues(evalExpr(order.expr, a.scope, { caseSensitiveStrings: true }), evalExpr(order.expr, b.scope, { caseSensitiveStrings: true }), true) ?? 0;
        if (cmp !== 0) return order.direction === "DESC" ? -cmp : cmp;
      }
      return 0;
    })
    .map((x) => x.doc);
}

export function executeSql(db: SqlDatabase, sql: string, options: SqlOptions = {}): SqlResult {
  if (sql.length > MAX_SQL_LENGTH) return { ok: false, error: `SQL text exceeds maximum length of ${MAX_SQL_LENGTH}.`, database: db };
  try {
    const statements = new Parser(new Tokenizer(sql, { doubleQuotedStrings: !!options.defaultTable })).parseBatch();
    if (statements.length === 0) return { ok: true, kind: "affected", rowCount: 0, message: "Commands completed successfully.", database: cloneDatabase(db) };
    const working = cloneDatabase(db);
    let last: SqlResult = { ok: true, kind: "affected", rowCount: 0, message: "Commands completed successfully.", database: working };
    let totalAffected = 0;
    let onlyAffected = true;
    for (const stmt of statements) {
      last = executeStatement(working, stmt, options);
      if (!last.ok) return { ...last, database: db };
      if (last.kind === "affected") totalAffected += last.rowCount;
      else onlyAffected = false;
    }
    if (statements.length > 1 && onlyAffected && last.ok && last.kind === "affected" && totalAffected > 0) {
      return { ...last, rowCount: totalAffected, message: affectedMessage(totalAffected), database: working };
    }
    return { ...last, database: working };
  } catch (error) {
    const message = error instanceof SqlError ? error.message : error instanceof Error ? error.message : "SQL execution failed.";
    return { ok: false, error: message, database: db };
  }
}
