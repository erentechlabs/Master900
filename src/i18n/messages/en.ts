import { common } from "./en/common";
import { errors, legal, nav } from "./en/core";
import { auth, catalog, enums, landing } from "./en/public";
import { learner } from "./en/learner";
import { assessment } from "./en/assessment";
import { labs } from "./en/labs";
import { planner, progress } from "./en/progress";
import { tutor } from "./en/tutor";
import { settings } from "./en/settings";
import { admin } from "./en/admin";

export const en = {
  common,
  nav,
  legal,
  errors,
  auth,
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
};

export type Messages = typeof en;
