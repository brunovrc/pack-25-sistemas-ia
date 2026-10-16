// Motor de comissões — API pública (puro, isomórfico, sem React nem I/O).
export * from './decimal';
export * from './money';
export * from './types';
export { validateTiers, tierAmount, tierBreakdown, type TierIssue } from './tiers';
export { allocateByWeights, poolSumsTo100 } from './split';
export { parseCondition, evalCondition, conditionDimensions } from './conditions';
export { DEFAULT_PRECEDENCE, resolveRules, validatePlanVersion, ruleDimensions, dimsKey, rankOf } from './rules';
export { computeCommissions, periodKey } from './calculate';
export { evaluateGoals, goalProgress, type GoalFacts, type GoalBonusRule, type GoalType, type GoalScope } from './goals';
