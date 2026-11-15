import { Bot, Check } from 'lucide-react'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { SelectField, SelectOption } from '@/components/ui/select'
import { ANTIGRAVITY_DEFAULTS, ANTIGRAVITY_MODELS } from '@/lib/domain/gemini-agent'
import type { GeminiConfig } from '@/types/gemini'

export function GeminiAgentFields({ value, onChange }: { value: GeminiConfig; onChange: <K extends keyof GeminiConfig>(key: K, value: GeminiConfig[K]) => void }) {
  return <section className="space-y-5" aria-label="Antigravity Agent 配置">
    <div className="flex items-center gap-2 text-body font-semibold"><Bot className="size-4 text-primary" />Antigravity Agent</div>
    <Field><FieldLabel htmlFor="agent-model">Agent 推理模型</FieldLabel>
      <SelectField id="agent-model" value={value.agentModel ?? ANTIGRAVITY_DEFAULTS.agentModel} onValueChange={(next) => onChange('agentModel', next)}>
        {ANTIGRAVITY_MODELS.map((model) => <SelectOption key={model.id} value={model.id}>{model.label}</SelectOption>)}
      </SelectField>
    </Field>
    <div className="grid grid-cols-2 gap-4">
      <Field><FieldLabel htmlFor="agent-budget">总 Token 预算</FieldLabel>
        <Input id="agent-budget" form="gemini-config-form" type="number" min={0} max={1000000000} step={1} required value={Number.isFinite(value.agentMaxTotalTokens ?? 0) ? value.agentMaxTotalTokens ?? 0 : ''} onChange={(event) => onChange('agentMaxTotalTokens', event.target.valueAsNumber)} />
        <FieldDescription>0 表示不额外限制</FieldDescription>
      </Field>
      <Field><FieldLabel htmlFor="agent-timeout">执行时限（分钟）</FieldLabel>
        <Input id="agent-timeout" form="gemini-config-form" type="number" min={1} max={175} step={1} required value={Number.isFinite(value.agentTimeoutMinutes ?? 175) ? value.agentTimeoutMinutes ?? 175 : ''} onChange={(event) => onChange('agentTimeoutMinutes', event.target.valueAsNumber)} />
        <FieldDescription>最长 175 分钟</FieldDescription>
      </Field>
    </div>
    <ul className="space-y-2 border-t pt-4 text-body" aria-label="已开启的 Agent 能力">
      {['代码执行与安装软件', '沙盒内文件读写', 'Google 搜索与网页访问', '不限制出站域名', '自动执行工具'].map(label => <li className="flex gap-2" key={label}><Check className="size-4 shrink-0 text-success" />{label}</li>)}
    </ul>
    <p className="text-caption text-muted-foreground">分段并发 16 · 每密钥 RPM 60 · RPD 10,000</p>
  </section>
}
