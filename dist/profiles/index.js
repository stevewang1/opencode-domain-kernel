import { codeProfile } from "./code/index.js";
import { contentProfile } from "./content/index.js";
const profiles = {
    code: codeProfile,
    content: contentProfile,
};
export function resolveProfile(name) {
    return profiles[name] ?? contentProfile;
}
export { codeProfile, contentProfile };
