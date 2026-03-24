import type { DomainName, DomainProfile } from "../core/types.js";
import { codeProfile } from "./code/index.js";
import { contentProfile } from "./content/index.js";
export declare function resolveProfile(name: DomainName): DomainProfile;
export { codeProfile, contentProfile };
