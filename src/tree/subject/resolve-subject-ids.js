"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveSubjectIds = resolveSubjectIds;
const filter_1 = require("./filter");
function resolveSubjectIds(supabase, filter) {
    return (0, filter_1.resolveSubjectIds)(supabase, filter);
}
