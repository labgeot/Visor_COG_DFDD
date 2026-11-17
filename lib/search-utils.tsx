import React from "react"
import { expandBilingualQuery } from "./es-en-glossary"
import type { AtributoDetalle, Categoria, Objeto, Subcategoria } from "./types"

/* -------------------------------------------------------------------------- */
/*                               Normalization                                */
/* -------------------------------------------------------------------------- */

/** Lowercases and removes diacritics ("Hidrografía" -> "hidrografia"). */
export const normalize = (value: unknown = ""): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

const normalizeWithMap = (text: string) => {
  let normalized = ""
  const map: number[] = []
  for (let i = 0; i < text.length; i++) {
    const n = normalize(text[i])
    for (let j = 0; j < n.length; j++) {
      normalized += n[j]
      map.push(i)
    }
  }
  return { normalized, map }
}

export interface HighlightSegment {
  text: string
  match: boolean
}

/** Splits text into highlighted segments for one or more queries (accent- & case-insensitive). */
export const getHighlightSegments = (text: string, query: string | string[]): HighlightSegment[] => {
  const rawList = Array.isArray(query) ? query : [query]
  const queries = Array.from(new Set(rawList.map((q) => normalize(q).trim()).filter((q) => q.length >= 2)))
  if (!text || queries.length === 0) return [{ text: text ?? "", match: false }]

  const { normalized, map } = normalizeWithMap(text)
  const ranges: Array<[number, number]> = []

  for (const q of queries) {
    let from = 0
    let idx = normalized.indexOf(q, from)
    while (idx !== -1) {
      const start = map[idx]
      const end = map[idx + q.length - 1] + 1
      ranges.push([start, end])
      from = idx + q.length
      idx = normalized.indexOf(q, from)
    }
  }

  if (ranges.length === 0) return [{ text, match: false }]

  // Merge overlapping or adjacent highlight ranges
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const merged: Array<[number, number]> = [ranges[0]]
  for (let i = 1; i < ranges.length; i++) {
    const prev = merged[merged.length - 1]
    const curr = ranges[i]
    if (curr[0] <= prev[1]) {
      prev[1] = Math.max(prev[1], curr[1])
    } else {
      merged.push(curr)
    }
  }

  const segments: HighlightSegment[] = []
  let cursor = 0
  for (const [start, end] of merged) {
    if (start > cursor) segments.push({ text: text.slice(cursor, start), match: false })
    segments.push({ text: text.slice(start, end), match: true })
    cursor = end
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), match: false })
  return segments
}

/** Highlights matches in JSX while preserving original text characters. */
export const highlight = (text: string, q: string | string[]): React.ReactNode => {
  const segments = getHighlightSegments(text, q)
  return (
    <>
      {segments.map((s, i) =>
        s.match ? (
          <mark key={i} className="bg-yellow-200 text-black px-0.5 rounded-sm">
            {s.text}
          </mark>
        ) : (
          <React.Fragment key={i}>{s.text}</React.Fragment>
        ),
      )}
    </>
  )
}

/** Returns a text snippet centered on the first matching query term. */
export const makeSnippet = (text: string, query: string | string[], radius = 70): string => {
  if (!text) return ""
  const rawList = Array.isArray(query) ? query : [query]
  const queries = rawList.map((q) => normalize(q).trim()).filter(Boolean)
  const { normalized, map } = normalizeWithMap(text)

  let firstIdx = -1
  let matchedLen = 0
  for (const q of queries) {
    const idx = normalized.indexOf(q)
    if (idx !== -1 && (firstIdx === -1 || idx < firstIdx)) {
      firstIdx = idx
      matchedLen = q.length
    }
  }

  if (firstIdx === -1 || text.length <= radius * 2) {
    return text.length > radius * 2 ? text.slice(0, radius * 2) + "…" : text
  }
  const startOrig = map[firstIdx]
  const start = Math.max(0, startOrig - radius)
  const end = Math.min(text.length, startOrig + matchedLen + radius)
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`
}

/** Generates a URL/file-friendly slug. */
export const getObjectSlug = (codigo: string | number, nombre: string): string =>
  `${codigo}-${nombre}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")

/* -------------------------------------------------------------------------- */
/*                                 Search Index                               */
/* -------------------------------------------------------------------------- */

interface Campo {
  etiqueta: string
  texto: string
  norm: string
  /** Lower = higher relevance */
  peso: number
}

const campo = (etiqueta: string, texto: unknown, peso: number): Campo => {
  const t = String(texto ?? "")
  return { etiqueta, texto: t, norm: normalize(t), peso }
}

export interface SubgrupoRef {
  categoria: Categoria
  subcategoria: Subcategoria
}

export interface ObjetoRef extends SubgrupoRef {
  objeto: Objeto
}

interface EntradaCategoria {
  tipo: "categoria"
  key: string
  categoria: Categoria
  campos: Campo[]
}

interface EntradaSubcategoria extends SubgrupoRef {
  tipo: "subcategoria"
  key: string
  campos: Campo[]
}

interface EntradaObjeto {
  tipo: "objeto"
  key: string
  objeto: Objeto
  refs: ObjetoRef[]
  campos: Campo[]
}

interface EntradaAtributo {
  tipo: "atributo"
  key: string
  codigo: string
  nombre: string
  detalle: AtributoDetalle
  subgrupos: SubgrupoRef[]
  campos: Campo[]
}

type Entrada = EntradaCategoria | EntradaSubcategoria | EntradaObjeto | EntradaAtributo

export interface SearchIndex {
  categorias: EntradaCategoria[]
  subcategorias: EntradaSubcategoria[]
  objetos: EntradaObjeto[]
  atributos: EntradaAtributo[]
}

/** Builds a deduplicated flat search index across the DFDD catalog and attributes. */
export const buildSearchIndex = (data: Categoria[], atributosDetalle: AtributoDetalle[]): SearchIndex => {
  const subgrupoPorCodigo = new Map<string, SubgrupoRef>()
  const objetosPorCodigo = new Map<string, { objeto: Objeto; refs: ObjetoRef[] }>()

  const index: SearchIndex = { categorias: [], subcategorias: [], objetos: [], atributos: [] }

  for (const categoria of data) {
    index.categorias.push({
      tipo: "categoria",
      key: `g-${categoria.codigo}`,
      categoria,
      campos: [
        campo("Code", categoria.codigo, 0),
        campo("AlphaCode", categoria.alphaCode, 1),
        campo("Name", categoria.nombre, 1),
        campo("Definition", categoria.contenido, 3),
        campo("Description", categoria.descripcion, 4),
      ],
    })

    for (const subcategoria of categoria.subcategorias) {
      const subRef: SubgrupoRef = { categoria, subcategoria }
      subgrupoPorCodigo.set(subcategoria.codigo, subRef)

      index.subcategorias.push({
        tipo: "subcategoria",
        key: `sg-${subcategoria.codigo}`,
        ...subRef,
        campos: [
          campo("Code", subcategoria.codigo, 0),
          campo("AlphaCode", subcategoria.alphaCode, 1),
          campo("Name", subcategoria.nombre, 1),
          campo("Definition", subcategoria.contenido, 3),
          campo("Description", subcategoria.descripcion, 4),
        ],
      })

      for (const objeto of subcategoria.objetos) {
        const ref: ObjetoRef = { ...subRef, objeto }
        const existing = objetosPorCodigo.get(objeto.codigo)
        if (existing) {
          existing.refs.push(ref)
        } else {
          objetosPorCodigo.set(objeto.codigo, { objeto, refs: [ref] })
        }
      }
    }
  }

  for (const [codigo, { objeto, refs }] of objetosPorCodigo) {
    index.objetos.push({
      tipo: "objeto",
      key: `fc-${codigo}`,
      objeto,
      refs,
      campos: [
        campo("5-3-1 Code", objeto.codigo, 0),
        campo("Short Name", objeto.shortName, 1),
        campo("Name", objeto.nombre, 1),
        campo("Alias(es)", objeto.aliases, 2),
        campo("Item ID", objeto.itemIdentifier ?? "", 2),
        campo("Definition", objeto.definicion, 3),
        campo("Description", objeto.descripcion, 4),
      ],
    })
  }

  for (const detalle of atributosDetalle) {
    const subgrupos: SubgrupoRef[] = []
    for (const sgCode of detalle.subgrupos ?? []) {
      const sgRef = subgrupoPorCodigo.get(sgCode)
      if (sgRef) subgrupos.push(sgRef)
    }

    const campos: Campo[] = [
      campo("5-3-1 Code", detalle.codigo, 0),
      campo("Short Name", detalle.shortName, 1),
      campo("Name", detalle.nombre, 1),
      campo("Alias(es)", detalle.aliases, 2),
      campo("Datatype", detalle.tipo, 2),
      campo("Datatype Name", detalle.datatype?.nombre ?? "", 2),
      campo("Definition", detalle.definicion, 3),
      campo("Description", detalle.descripcion, 4),
      campo("Physical Quantity", detalle.cantidadFisica?.nombre ?? "", 3),
      campo("Recommended Unit", detalle.unidadRecomendada?.nombre ?? "", 3),
      campo("Additional Codes", detalle.additionalCodes, 4),
      campo("Item ID", detalle.itemIdentifier ?? "", 3),
    ]

    for (const valor of detalle.dominio ?? []) {
      campos.push(campo("Listed Value", `${valor.codigo}: ${valor.etiqueta}`, 2))
      if (valor.definicion) campos.push(campo("Listed Value Definition", valor.definicion, 4))
    }

    index.atributos.push({
      tipo: "atributo",
      key: `ac-${detalle.codigo}`,
      codigo: detalle.codigo,
      nombre: detalle.nombre,
      detalle,
      subgrupos,
      campos,
    })
  }

  return index
}

/* -------------------------------------------------------------------------- */
/*                               Bilingual Search                             */
/* -------------------------------------------------------------------------- */

export interface Coincidencia {
  etiqueta: string
  texto: string
}

export type SearchHit<E extends Entrada = Entrada> = E & {
  score: number
  /** Primary matched field */
  coincidencia: Coincidencia
  /** Secondary matched fields */
  otras: Coincidencia[]
}

export interface SearchResults {
  query: string
  /** Translated English terms used when Spanish input was detected */
  translatedTerms: string[]
  categorias: SearchHit<EntradaCategoria>[]
  subcategorias: SearchHit<EntradaSubcategoria>[]
  objetos: SearchHit<EntradaObjeto>[]
  atributos: SearchHit<EntradaAtributo>[]
  total: number
}

export const MIN_QUERY_LENGTH = 2

const isWordBoundaryMatch = (textNorm: string, term: string): boolean => {
  const idx = textNorm.indexOf(term)
  if (idx === -1) return false
  let from = idx
  while (from !== -1) {
    const prev = from === 0 ? " " : textNorm[from - 1]
    if (!/[a-z0-9]/.test(prev)) return true
    from = textNorm.indexOf(term, from + 1)
  }
  return false
}

const isExactWordMatch = (textNorm: string, term: string): boolean => {
  let from = textNorm.indexOf(term)
  while (from !== -1) {
    const prev = from === 0 ? " " : textNorm[from - 1]
    const next = from + term.length >= textNorm.length ? " " : textNorm[from + term.length]
    if (!/[a-z0-9]/.test(prev) && !/[a-z0-9]/.test(next)) return true
    from = textNorm.indexOf(term, from + 1)
  }
  return false
}

/** Scores a single term against a field; returns null if no match. */
const scoreTermInField = (
  fieldNorm: string,
  peso: number,
  term: string,
  isTranslatedTerm: boolean,
  synonymRank: number,
): number | null => {
  if (!fieldNorm) return null

  if (fieldNorm === term) {
    return peso * 10 + synonymRank * 2
  }
  if (isExactWordMatch(fieldNorm, term)) {
    return peso * 10 + 1 + synonymRank * 2
  }
  if (fieldNorm.startsWith(term) || isWordBoundaryMatch(fieldNorm, term)) {
    return peso * 10 + 2 + synonymRank * 2
  }

  // Require word-start boundary for short translated English words (<= 4 chars, e.g. "sea", "dam", "air")
  // to avoid noisy substring hits like "research" for "mar" -> "sea".
  if (isTranslatedTerm && term.length <= 4) {
    return null
  }

  if (fieldNorm.includes(term)) {
    return peso * 10 + 4 + synonymRank * 2
  }
  return null
}

const evaluar = <E extends Entrada>(
  entrada: E,
  rawQ: string,
  groups: string[][],
  usedTranslation: boolean,
): SearchHit<E> | null => {
  let mejor: Campo | null = null
  let score = Infinity
  const otras: Coincidencia[] = []

  // 1. Direct match on the raw query (English term or code).
  // When the query was recognized as a Spanish term (usedTranslation && rawQ.length <= 4),
  // require an exact word match for the raw token so short Spanish words like "mar"
  // don't accidentally match English prefixes like "markings".
  const skipShortRawPrefix = usedTranslation && rawQ.length <= 4 && !rawQ.includes(" ")
  for (const c of entrada.campos) {
    if (skipShortRawPrefix && c.norm !== rawQ && !isExactWordMatch(c.norm, rawQ)) continue
    const s = scoreTermInField(c.norm, c.peso, rawQ, false, 0)
    if (s === null) continue
    if (s < score) {
      if (mejor) otras.push({ etiqueta: mejor.etiqueta, texto: mejor.texto })
      score = s
      mejor = c
    } else {
      otras.push({ etiqueta: c.etiqueta, texto: c.texto })
    }
  }

  // 2. Bilingual expansion match (AND across token groups, OR across each group's English synonyms)
  if (usedTranslation && groups.length > 0) {
    let allGroupsMatched = true
    let groupScoreSum = 0
    let bestGroupField: Campo | null = null
    let bestGroupFieldScore = Infinity
    const matchedFields = new Set<Campo>()

    for (const synList of groups) {
      let bestSynScore = Infinity
      let bestSynField: Campo | null = null

      for (let synIdx = 0; synIdx < synList.length; synIdx++) {
        const term = synList[synIdx]
        // synIdx === 0 when synList[0] === rawToken is the raw token itself;
        // if this group was translated and the raw token is short (<= 4 chars), treat it like a short translated word
        const isTranslated = synIdx > 0 || !rawQ.includes(term) || (synList.length > 1 && term.length <= 4)
        for (const c of entrada.campos) {
          if (synIdx === 0 && synList.length > 1 && term.length <= 4 && !isExactWordMatch(c.norm, term)) continue
          const s = scoreTermInField(c.norm, c.peso, term, isTranslated, synIdx)
          if (s === null) continue
          if (s < bestSynScore) {
            bestSynScore = s
            bestSynField = c
          }
        }
      }

      if (!bestSynField) {
        allGroupsMatched = false
        break
      }

      groupScoreSum += bestSynScore
      matchedFields.add(bestSynField)
      if (bestSynScore < bestGroupFieldScore) {
        bestGroupFieldScore = bestSynScore
        bestGroupField = bestSynField
      }
    }

    if (allGroupsMatched && bestGroupField) {
      // Average score across groups + slight offset so direct English exact matches stay first
      const bilingualScore = Math.round(groupScoreSum / groups.length) + 1
      if (bilingualScore < score) {
        if (mejor) otras.push({ etiqueta: mejor.etiqueta, texto: mejor.texto })
        score = bilingualScore
        mejor = bestGroupField
      }
      for (const mf of matchedFields) {
        if (mf !== mejor && !otras.some((o) => o.etiqueta === mf.etiqueta && o.texto === mf.texto)) {
          otras.push({ etiqueta: mf.etiqueta, texto: mf.texto })
        }
      }
    }
  }

  if (!mejor) return null
  return {
    ...entrada,
    score,
    coincidencia: { etiqueta: mejor.etiqueta, texto: mejor.texto },
    otras,
  } as SearchHit<E>
}

const buscarEn = <E extends Entrada>(
  entradas: E[],
  rawQ: string,
  groups: string[][],
  usedTranslation: boolean,
  nombreDe: (e: E) => string,
) =>
  entradas
    .map((e) => evaluar(e, rawQ, groups, usedTranslation))
    .filter((h): h is SearchHit<E> => h !== null)
    .sort((a, b) => a.score - b.score || nombreDe(a).localeCompare(nombreDe(b), "en"))

/** Searches the DFDD index supporting both English and Spanish queries. */
export const searchIndex = (index: SearchIndex, query: string): SearchResults | null => {
  const expanded = expandBilingualQuery(query)
  const q = expanded.rawNorm
  if (q.length < MIN_QUERY_LENGTH) return null

  const categorias = buscarEn(index.categorias, q, expanded.groups, expanded.usedTranslation, (e) => e.categoria.nombre)
  const subcategorias = buscarEn(
    index.subcategorias,
    q,
    expanded.groups,
    expanded.usedTranslation,
    (e) => e.subcategoria.nombre,
  )
  const objetos = buscarEn(index.objetos, q, expanded.groups, expanded.usedTranslation, (e) => e.objeto.nombre)
  const atributos = buscarEn(index.atributos, q, expanded.groups, expanded.usedTranslation, (e) => e.nombre)

  return {
    query: q,
    translatedTerms: expanded.translatedTerms,
    categorias,
    subcategorias,
    objetos,
    atributos,
    total: categorias.length + subcategorias.length + objetos.length + atributos.length,
  }
}

/** Helper for local subgroup/modal filtering supporting both English and Spanish queries. */
export const matchesBilingualFields = (fields: unknown[], query: string): boolean => {
  const expanded = expandBilingualQuery(query)
  if (!expanded.rawNorm) return true
  const combined = fields.map((f) => normalize(f)).join(" ")
  if (combined.includes(expanded.rawNorm)) return true
  if (!expanded.usedTranslation || expanded.groups.length === 0) return false

  return expanded.groups.every((synList) =>
    synList.some((term, idx) =>
      idx > 0 && term.length <= 4 ? isWordBoundaryMatch(combined, term) : combined.includes(term),
    ),
  )
}
