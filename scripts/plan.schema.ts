import { z } from 'zod'

const MethodGuardSchema = z.object({
  name: z.string(),
  signature: z.string(),
  body_only: z.boolean().optional(),
})

const ClassGuardSchema = z.object({
  name: z.string(),
  file: z.string(),
  methods: z.array(MethodGuardSchema).optional(),
})

const AllowedChangesSchema = z.object({
  classes: z.array(ClassGuardSchema).optional(),
  max_added_lines: z.number().int().nonnegative().optional(),
  allow_private_helper_in_class: z.number().int().min(0).optional(),
})

const ValidationSchema = z.object({
  deny_new_exports: z.boolean().optional(),
  deny_top_level_state: z.boolean().optional(),
  deny_any: z.boolean().optional(),
  deny_console_log: z.boolean().optional(),
})

const MetaSchema = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string(),
  runtime: z.string(),
  risk_level: z.string(),
})

const IntentSchema = z.object({
  purpose: z.string(),
  scope_in: z.array(z.string()).default([]),
})

const ContractsSchema = z.object({
  public_api_invariant: z.array(z.string()).default([]),
})

export const PlanSchema = z.object({
  meta: MetaSchema,
  intent: IntentSchema,
  contracts: ContractsSchema,
  allowed_changes: AllowedChangesSchema.optional(),
  validation: ValidationSchema.optional(),
})

export type Plan = z.infer<typeof PlanSchema>
