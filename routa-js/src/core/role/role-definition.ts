/**
 * RoleDefinition - port of routa-core RoleDefinition.kt
 *
 * Complete definition of an agent role, including its system prompt and behavioral rules.
 * These definitions tell the LLM how to behave when operating as each role.
 * Adapted from the Intent by Augment multi-agent architecture.
 */

import { AgentRole, ModelTier } from "../models/agent";

export interface RoleDefinition {
  /** The role enum value */
  role: AgentRole;

  /** Display name shown to users */
  displayName: string;

  /** Short description of the role */
  description: string;

  /** Default model tier for this role */
  defaultModelTier: ModelTier;

  /** The full system/behavior prompt injected into the LLM */
  systemPrompt: string;

  /** Short reminder appended to each turn to reinforce key rules */
  roleReminder: string;
}

