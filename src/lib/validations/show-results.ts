import { z } from "zod";

import { SHOW_RESULTS_REQUIRED_MESSAGE } from "@/lib/exam/result-visibility-rules";

/** Phase O - "Show results to students?": a REQUIRED yes / no whenever a Reading, Listening or Writing test is made. Left unanswered it is refused with this sentence. */
export const showResultsSchema = z.boolean({ error: SHOW_RESULTS_REQUIRED_MESSAGE });
