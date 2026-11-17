import React from "react"
import type { AtributoDetalle, Categoria, Objeto, Subcategoria } from "./types"

/* -------------------------------------------------------------------------- */
/*                               Normalización                                */
/* -------------------------------------------------------------------------- */

/** Pasa a minúsculas y elimina tildes/diacríticos ("Hidrografía" -> "hidrografia"). */
export const normalize = (value: unknown = ""): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

/**
 * Normaliza carácter por carácter guardando la posición original de cada
 * carácter normalizado, para poder resaltar sobre el texto original.
 */
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

/** Divide un texto en segmentos marcando las coincidencias (insensible a tildes y mayúsculas). */
export const getHighlightSegments = (text: string, query: string): HighlightSegment[] => {
  const q = normalize(query).trim()
  if (!text || !q) return [{ text: text ?? "", match: false }]

  const { normalized, map } = normalizeWithMap(text)
  const segments: HighlightSegment[] = []
  let cursor = 0
  let from = 0
  let idx = normalized.indexOf(q, from)

  while (idx !== -1) {
    const start = map[idx]
    const end = map[idx + q.length - 1] + 1
    if (start > cursor) segments.push({ text: text.slice(cursor, start), match: false })
    segments.push({ text: text.slice(start, end), match: true })
    cursor = end
    from = idx + q.length
    idx = normalized.indexOf(q, from)
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), match: false })
  return segments
}

/** Resalta en JSX las coincidencias de `q` dentro de `text` preservando caracteres originales. */
export const highlight = (text: string, q: string): React.ReactNode => {
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

/** Devuelve un fragmento del texto centrado en la primera coincidencia. */
export const makeSnippet = (text: string, query: string, radius = 70): string => {
  if (!text) return ""
  const q = normalize(query).trim()
  const { normalized, map } = normalizeWithMap(text)
  const idx = normalized.indexOf(q)
  if (idx === -1 || text.length <= radius * 2) return text.length > radius * 2 ? text.slice(0, radius * 2) + "…" : text
  const startOrig = map[idx]
  const start = Math.max(0, startOrig - radius)
  const end = Math.min(text.length, startOrig + q.length + radius)
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`
}

/** Genera un slug amigable para nombres de archivo o enlaces externos. */
export const getObjectSlug = (codigo: string | number, nombre: string): string =>
  `${codigo}-${nombre}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")

/* -------------------------------------------------------------------------- */
/*                                   Índice                                   */
/* -------------------------------------------------------------------------- */

interface Campo {
  etiqueta: string
  texto: string
  norm: string
  /** Menor = más relevante */
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
  /** Todos los subgrupos DFDD a los que pertenece este FeatureConcept */
  refs: ObjetoRef[]
  campos: Campo[]
}

interface EntradaAtributo {
  tipo: "atributo"
  key: string
  codigo: string
  nombre: string
  detalle: AtributoDetalle
  /** Todos los subgrupos DFDD que incluyen este AttributeConcept */
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

/** Recorre el diccionario DFDD una sola vez y genera un índice plano deduplicado de búsqueda. */
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
/*                                  Búsqueda                                  */
/* -------------------------------------------------------------------------- */

export interface Coincidencia {
  etiqueta: string
  texto: string
}

export type SearchHit<E extends Entrada = Entrada> = E & {
  score: number
  /** Campo principal por el que coincidió (el más relevante) */
  coincidencia: Coincidencia
  /** Coincidencias secundarias (ej. valores de dominio) */
  otras: Coincidencia[]
}

export interface SearchResults {
  query: string
  categorias: SearchHit<EntradaCategoria>[]
  subcategorias: SearchHit<EntradaSubcategoria>[]
  objetos: SearchHit<EntradaObjeto>[]
  atributos: SearchHit<EntradaAtributo>[]
  total: number
}

export const MIN_QUERY_LENGTH = 2

const evaluar = <E extends Entrada>(entrada: E, q: string): SearchHit<E> | null => {
  let mejor: Campo | null = null
  let score = Infinity
  const otras: Coincidencia[] = []

  for (const c of entrada.campos) {
    if (!c.norm) continue
    let s: number
    if (c.norm === q) s = c.peso * 10
    else if (c.norm.startsWith(q)) s = c.peso * 10 + 1
    else if (c.norm.includes(q)) s = c.peso * 10 + 2
    else continue

    if (s < score) {
      if (mejor) otras.push({ etiqueta: mejor.etiqueta, texto: mejor.texto })
      score = s
      mejor = c
    } else {
      otras.push({ etiqueta: c.etiqueta, texto: c.texto })
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

const buscarEn = <E extends Entrada>(entradas: E[], q: string, nombreDe: (e: E) => string) =>
  entradas
    .map((e) => evaluar(e, q))
    .filter((h): h is SearchHit<E> => h !== null)
    .sort((a, b) => a.score - b.score || nombreDe(a).localeCompare(nombreDe(b), "en"))

/** Busca en todo el índice DFDD. Devuelve null si la consulta es demasiado corta. */
export const searchIndex = (index: SearchIndex, query: string): SearchResults | null => {
  const q = normalize(query).trim()
  if (q.length < MIN_QUERY_LENGTH) return null

  const categorias = buscarEn(index.categorias, q, (e) => e.categoria.nombre)
  const subcategorias = buscarEn(index.subcategorias, q, (e) => e.subcategoria.nombre)
  const objetos = buscarEn(index.objetos, q, (e) => e.objeto.nombre)
  const atributos = buscarEn(index.atributos, q, (e) => e.nombre)

  return {
    query: q,
    categorias,
    subcategorias,
    objetos,
    atributos,
    total: categorias.length + subcategorias.length + objetos.length + atributos.length,
  }
}
