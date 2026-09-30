import type { DeepPartial } from "../translator";
import type { Messages } from "./en";
import { common } from "./tr/common";
import { nav, legal, errors } from "./tr/core";
import { auth, landing, catalog, enums } from "./tr/public";
import { learner } from "./tr/learner";
import { assessment } from "./tr/assessment";
import { labs } from "./tr/labs";
import { planner, progress } from "./tr/progress";
import { tutor, settings } from "./tr/tutor";
import { admin } from "./tr/admin";

/**
 * Turkish dictionary, one file per namespace in ./tr (mirrors ./en).
 * Missing keys fall back to English at runtime; the i18n parity test ensures completeness.
 */
export const tr: DeepPartial<Messages> = {
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