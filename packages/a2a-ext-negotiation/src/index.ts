import { uri as approvalUri } from "@ix/a2a-ext-approval";
import { uri as mandateUri } from "@ix/a2a-ext-mandate";
import { uri as transcriptUri } from "@ix/a2a-ext-transcript";

export { parties, signatureVerification, status, uri } from "./model.js";
export type { Clock, Party, UnverifiedSignature } from "./model.js";
export { ianaZoneNames, tzdbVersion } from "./zones.js";
export {
  applyChainedTermMessage,
  chainedHashes,
  expectedPrevHash,
  expectedValueHash,
  manifestHash,
  presetChainProblem,
  sealTermMessage,
  termHash,
  termSheetHash,
  unsealedHash,
} from "./chain.js";
export type { ChainedTermResult } from "./chain.js";
export {
  applyTermMessage,
  buildTermAgreement,
  checkTermDefinition,
  checkTermValue,
  coreSheet,
  coreTerms,
  counterpartOf,
  deadlineIn,
  decodeTermMessage,
  durationUnits,
  initialSpecTerm,
  maxTermMessageDepth,
  isCurrencyCode,
  isSafeRelativePath,
  isZoneName,
  iso4217Currencies,
  openTermSession,
  readyForAgreement,
  sameTermAgreement,
  sameTermValue,
  termMessageTypes,
  termNoDealReasons,
  termPhases,
  termStatuses,
  termValueTypes,
  valueHashVerification,
  webSiteSheet,
  zoneOffsetMinutes,
} from "./terms.js";
export type {
  DealDeclineMessage,
  FixedTerm,
  PresetTerm,
  SheetRef,
  TermAcceptMessage,
  TermAddMessage,
  TermAgreement,
  TermAgreementDraftMessage,
  TermDecodeResult,
  TermApprovalMessage,
  TermDefinition,
  TermDropMessage,
  TermJson,
  TermMessage,
  TermMessageType,
  TermNoDealReason,
  TermPhase,
  TermPrior,
  TermProposeMessage,
  TermRefuseMessage,
  TermResult,
  TermSession,
  TermSheet,
  TermState,
  TermStatus,
  TermValueType,
} from "./terms.js";

export const requiredExtensionUris = [mandateUri, approvalUri, transcriptUri] as const;
