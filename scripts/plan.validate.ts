import fs from 'node:fs'
import yaml from 'yaml'
import { PlanSchema } from './plan.schema'
import { logger } from './logger'

const file = process.argv[2] || 'plans/FEAT-123.yaml'
const content = fs.readFileSync(file, 'utf8')
const data = yaml.parse(content)
const result = PlanSchema.safeParse(data)

if (!result.success) {
  logger.error('Plan validation failed', result.error.format())
  process.exit(1)
}

logger.info('Plan OK', result.data.meta.id)
