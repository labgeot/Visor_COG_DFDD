export interface DominioValor {
  codigo: string
  shortName: string
  etiqueta: string
  definicion: string
  observaciones: string
  aliases?: string
  itemIdentifier?: number | null
  url?: string
}

export interface DatatypeCampo {
  shortName: string
  nombre: string
  definicion: string
  multiplicidad: string
  coleccion: string
  codigo: string
  especificacion: string
}

export interface DatatypeInfo {
  shortName: string
  nombre: string
  definicion: string
  descripcion: string
  nota: string
  especificacion: string
  completa: boolean | null
  longitud: number | string | null
  lexical: boolean | null
  estructura: string
  resourceUri: string
  rangoMin: string
  rangoMax: string
  itemIdentifier: number | null
  url: string
  campos: DatatypeCampo[]
}

export interface PhysicalQuantityInfo {
  shortName: string
  nombre: string
  definicion: string
  descripcion: string
  aliases: string
  itemIdentifier: number | null
  url: string
}

export interface UnitOfMeasureInfo {
  shortName: string
  codigo: number | string | null
  nombre: string
  definicion: string
  descripcion: string
  aliases: string
  physicalQuantity: string
  physicalQuantityShort: string
  itemIdentifier: number | null
  url: string
  additionalCodes: string
}

export interface AtributoDetalle {
  codigo: string
  shortName: string
  nombre: string
  definicion: string
  descripcion: string
  aliases: string
  multiplicidad: string
  coleccion: string
  tipo: string
  tipoEspecificacion: string
  datatype: DatatypeInfo | null
  cantidadFisica: PhysicalQuantityInfo | null
  unidadRecomendada: UnitOfMeasureInfo | null
  unidadNoComparable: string
  completa: boolean | null
  itemIdentifier: number | null
  url: string
  additionalCodes: string
  subgrupos: string[]
  dominio: DominioValor[] | null
}

export interface Objeto {
  codigo: string
  shortName: string
  nombre: string
  definicion: string
  descripcion: string
  aliases: string
  itemIdentifier: number | null
  url: string
  subgrupos: string[]
}

export interface Subcategoria {
  codigo: string
  groupCodigo: string
  alphaCode: string
  nombre: string
  contenido: string
  descripcion: string
  objetos: Objeto[]
  atributosCodigos: string[]
}

export interface Categoria {
  codigo: string
  alphaCode: string
  nombre: string
  contenido: string
  descripcion: string
  subcategorias: Subcategoria[]
}
