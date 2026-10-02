import { common } from "./en/common";
import { errors, legal, nav } from "./en/core";
import { catalog, enums, landing } from "./en/public";
import { learner } from "./en/learner";
import { assessment } from "./en/assessment";
import { labs } from "./en/labs";
import { planner, progress } from "./en/progress";
import { tutor } from "./en/tutor";
import { settings } from "./en/settings";
import { admin } from "./en/admin";
import { shell } from "./en/shell";

export const en = {
  common,
  nav,
  legal,
  errors,
  landing,
  catalog,
  enums,
  learner,
  assessment,
  labs,
  planner,
  progress,
  tutor,
  settings,
  admin,
  shell,
};

export type Messages = typeof en;
