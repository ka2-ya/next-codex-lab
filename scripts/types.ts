export interface IndexEntry {
  id: string
  kind: string
  name?: string
  file: string
  start: number
  end: number
  text: string
}

export interface EmbeddedDocument extends IndexEntry {
  vector: Record<string, number>
  norm: number
  embedding?: number[]
  embeddingNorm?: number
}

export interface EmbeddingPayload {
  generatedAt: string
  embeddingModel?: string
  documents: EmbeddedDocument[]
  idf: Record<string, number>
}
