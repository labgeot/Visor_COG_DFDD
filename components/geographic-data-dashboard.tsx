"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Search,
  MapPin,
  Database,
  Layers,
  Factory,
  Users,
  Truck,
  Waves,
  Mountain,
  Leaf,
  Shield,
  ArrowLeft,
  Cloud,
  MapIcon,
  FileText,
  Archive,
  Download,
  ExternalLink,
  Plane,
  SlidersHorizontal,
  Tag,
  BookOpen,
  ChevronRight,
  Ruler,
  X,
} from "lucide-react"
import { SearchResults } from "@/components/search-results"
import { useDebounce } from "@/hooks/use-debounce"
import {
  buildSearchIndex,
  getObjectSlug,
  normalize,
  searchIndex,
  type ObjetoRef,
  type SubgrupoRef,
} from "@/lib/search-utils"
import type { AtributoDetalle, Categoria, Objeto, Subcategoria } from "@/lib/types"

import catalogData from "@/data/dfdd-catalogo.json"

const groupColors: Record<
  string,
  {
    color: string
    circleColor: string
    hoverColor: string
    icon: typeof Database
  }
> = {
  "01": {
    color: "bg-amber-50/70 text-gray-900 border-amber-200",
    circleColor: "bg-amber-500",
    hoverColor: "hover:bg-amber-100/70",
    icon: Factory,
  },
  "02": {
    color: "bg-rose-50/70 text-gray-900 border-rose-200",
    circleColor: "bg-rose-500",
    hoverColor: "hover:bg-rose-100/70",
    icon: Users,
  },
  "03": {
    color: "bg-orange-50/70 text-gray-900 border-orange-200",
    circleColor: "bg-orange-500",
    hoverColor: "hover:bg-orange-100/70",
    icon: Truck,
  },
  "04": {
    color: "bg-cyan-50/70 text-gray-900 border-cyan-200",
    circleColor: "bg-cyan-600",
    hoverColor: "hover:bg-cyan-100/70",
    icon: Waves,
  },
  "05": {
    color: "bg-yellow-50/70 text-gray-900 border-yellow-300",
    circleColor: "bg-yellow-600",
    hoverColor: "hover:bg-yellow-100/70",
    icon: Mountain,
  },
  "06": {
    color: "bg-green-50/70 text-gray-900 border-green-200",
    circleColor: "bg-green-600",
    hoverColor: "hover:bg-green-100/70",
    icon: Leaf,
  },
  "07": {
    color: "bg-slate-50/90 text-gray-900 border-slate-300",
    circleColor: "bg-slate-600",
    hoverColor: "hover:bg-slate-100",
    icon: MapIcon,
  },
  "08": {
    color: "bg-sky-50/70 text-gray-900 border-sky-200",
    circleColor: "bg-sky-600",
    hoverColor: "hover:bg-sky-100/70",
    icon: Plane,
  },
  "09": {
    color: "bg-purple-50/70 text-gray-900 border-purple-200",
    circleColor: "bg-purple-600",
    hoverColor: "hover:bg-purple-100/70",
    icon: Shield,
  },
  "10": {
    color: "bg-blue-50/70 text-gray-900 border-blue-200",
    circleColor: "bg-blue-600",
    hoverColor: "hover:bg-blue-100/70",
    icon: Cloud,
  },
  "20": {
    color: "bg-teal-50/70 text-gray-900 border-teal-200",
    circleColor: "bg-teal-600",
    hoverColor: "hover:bg-teal-100/70",
    icon: SlidersHorizontal,
  },
  "21": {
    color: "bg-indigo-50/70 text-gray-900 border-indigo-200",
    circleColor: "bg-indigo-600",
    hoverColor: "hover:bg-indigo-100/70",
    icon: Tag,
  },
  "22": {
    color: "bg-emerald-50/70 text-gray-900 border-emerald-200",
    circleColor: "bg-emerald-700",
    hoverColor: "hover:bg-emerald-100/70",
    icon: BookOpen,
  },
  "23": {
    color: "bg-violet-50/70 text-gray-900 border-violet-200",
    circleColor: "bg-violet-600",
    hoverColor: "hover:bg-violet-100/70",
    icon: Archive,
  },
}

const defaultGroupConfig = {
  color: "bg-gray-100 text-gray-900 border-gray-300",
  circleColor: "bg-gray-700",
  hoverColor: "hover:bg-gray-200",
  icon: Database,
}

const downloadJson = (filename: string, payload: unknown) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

type NavigationLevel = "categories" | "subcategories" | "objects"

export function GeographicDataDashboard() {
  const [searchTerm, setSearchTerm] = useState("")
  const [currentLevel, setCurrentLevel] = useState<NavigationLevel>("categories")
  const [selectedCategory, setSelectedCategory] = useState<Categoria | null>(null)
  const [selectedSubcategory, setSelectedSubcategory] = useState<Subcategoria | null>(null)
  const [subgroupTab, setSubgroupTab] = useState<"objects" | "attributes">("objects")
  const [subgroupFilter, setSubgroupFilter] = useState("")
  const [expandedDefinitions, setExpandedDefinitions] = useState<Set<string>>(new Set())

  const [atributos, setAtributos] = useState<AtributoDetalle[]>([])
  const [atributosLoaded, setAtributosLoaded] = useState(false)

  // Modales controlados
  const [openObjeto, setOpenObjeto] = useState<Objeto | null>(null)
  const [openAtributo, setOpenAtributo] = useState<AtributoDetalle | null>(null)
  const [domainFilter, setDomainFilter] = useState("")
  const [modalAttrFilter, setModalAttrFilter] = useState("")

  const data = catalogData as Categoria[]

  useEffect(() => {
    fetch("/dfdd-atributos.json")
      .then((res) => res.json())
      .then((json: AtributoDetalle[]) => {
        setAtributos(json)
        setAtributosLoaded(true)
      })
      .catch((error) => {
        console.error("Error loading DFDD attributes:", error)
        setAtributosLoaded(true)
      })
  }, [])

  const atributosMap = useMemo(() => new Map(atributos.map((a) => [a.codigo, a])), [atributos])

  const subgroupLookup = useMemo(() => {
    const map = new Map<string, SubgrupoRef>()
    for (const cat of data) {
      for (const sub of cat.subcategorias) {
        map.set(sub.codigo, { categoria: cat, subcategoria: sub })
      }
    }
    return map
  }, [data])

  const stats = useMemo(() => {
    let subgrupos = 0
    const uniqueObjects = new Set<string>()
    const uniqueDatatypes = new Set<string>()
    let domainValues = 0
    for (const cat of data) {
      subgrupos += cat.subcategorias.length
      for (const sub of cat.subcategorias) {
        for (const obj of sub.objetos) uniqueObjects.add(obj.codigo)
      }
    }
    for (const attr of atributos) {
      if (attr.tipo) uniqueDatatypes.add(attr.tipo)
      if (attr.dominio) domainValues += attr.dominio.length
    }
    return {
      grupos: data.length,
      subgrupos,
      objetosUnicos: uniqueObjects.size,
      atributos: atributos.length || 1774,
      datatypes: uniqueDatatypes.size || 872,
      dominios: domainValues || 10769,
    }
  }, [data, atributos])

  // Búsqueda global con debounce de 200ms
  const debouncedSearchTerm = useDebounce(searchTerm, 200)
  const searchIdx = useMemo(() => buildSearchIndex(data, atributos), [data, atributos])
  const searchResults = useMemo(() => searchIndex(searchIdx, debouncedSearchTerm), [searchIdx, debouncedSearchTerm])

  const getCategoryConfig = (codigo: string) => groupColors[codigo] || defaultGroupConfig

  const scrollToContent = () => {
    document.getElementById("main-content")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const handleCategorySelect = (categoria: Categoria) => {
    setSelectedCategory(categoria)
    setSelectedSubcategory(null)
    setCurrentLevel("subcategories")
    setSearchTerm("")
    setSubgroupFilter("")
  }

  const handleSubcategorySelect = (subcategoria: Subcategoria, parentCategoria?: Categoria) => {
    if (parentCategoria) setSelectedCategory(parentCategoria)
    setSelectedSubcategory(subcategoria)
    setCurrentLevel("objects")
    setSubgroupTab(subcategoria.objetos.length === 0 && subcategoria.atributosCodigos.length > 0 ? "attributes" : "objects")
    setSearchTerm("")
    setSubgroupFilter("")
  }

  const handleNavigateSubgroupCode = (sgCode: string) => {
    const ref = subgroupLookup.get(sgCode)
    if (!ref) return
    setOpenObjeto(null)
    setOpenAtributo(null)
    handleSubcategorySelect(ref.subcategoria, ref.categoria)
    scrollToContent()
  }

  const handleBackNavigation = () => {
    if (currentLevel === "objects") {
      setCurrentLevel("subcategories")
      setSelectedSubcategory(null)
      setSubgroupFilter("")
    } else if (currentLevel === "subcategories") {
      setCurrentLevel("categories")
      setSelectedCategory(null)
      setSelectedSubcategory(null)
    }
    setSearchTerm("")
  }

  /* ----------------------- Navegación desde la búsqueda ---------------------- */

  const handleSearchSelectCategoria = (categoria: Categoria) => {
    handleCategorySelect(categoria)
    scrollToContent()
  }

  const handleSearchSelectSubcategoria = (categoria: Categoria, subcategoria: Subcategoria) => {
    handleSubcategorySelect(subcategoria, categoria)
    scrollToContent()
  }

  const handleSearchSelectObjeto = (ref: ObjetoRef) => {
    handleSubcategorySelect(ref.subcategoria, ref.categoria)
    setSubgroupTab("objects")
    setModalAttrFilter("")
    setOpenObjeto(ref.objeto)
  }

  const handleSearchSelectAtributo = (atributo: AtributoDetalle, subgrupoRef?: SubgrupoRef) => {
    if (subgrupoRef) {
      handleSubcategorySelect(subgrupoRef.subcategoria, subgrupoRef.categoria)
      setSubgroupTab("attributes")
    } else {
      setSearchTerm("")
    }
    setDomainFilter("")
    setOpenAtributo(atributo)
  }

  const toggleDefinition = (codigo: string) => {
    setExpandedDefinitions((prev) => {
      const next = new Set(prev)
      next.has(codigo) ? next.delete(codigo) : next.add(codigo)
      return next
    })
  }

  // Atributos del subgrupo seleccionado
  const selectedSubgroupAttributes = useMemo(() => {
    if (!selectedSubcategory) return []
    return selectedSubcategory.atributosCodigos
      .map((code) => atributosMap.get(code))
      .filter((a): a is AtributoDetalle => Boolean(a))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "en"))
  }, [selectedSubcategory, atributosMap])

  const filteredSubgroupObjects = useMemo(() => {
    if (!selectedSubcategory) return []
    const q = normalize(subgroupFilter).trim()
    if (!q) return selectedSubcategory.objetos
    return selectedSubcategory.objetos.filter(
      (o) =>
        normalize(o.nombre).includes(q) ||
        normalize(o.codigo).includes(q) ||
        normalize(o.shortName).includes(q) ||
        normalize(o.definicion).includes(q),
    )
  }, [selectedSubcategory, subgroupFilter])

  const filteredSubgroupAttributes = useMemo(() => {
    const q = normalize(subgroupFilter).trim()
    if (!q) return selectedSubgroupAttributes
    return selectedSubgroupAttributes.filter(
      (a) =>
        normalize(a.nombre).includes(q) ||
        normalize(a.codigo).includes(q) ||
        normalize(a.shortName).includes(q) ||
        normalize(a.tipo).includes(q) ||
        normalize(a.definicion).includes(q),
    )
  }, [selectedSubgroupAttributes, subgroupFilter])

  const filteredModalAttributes = useMemo(() => {
    const q = normalize(modalAttrFilter).trim()
    if (!q) return selectedSubgroupAttributes
    return selectedSubgroupAttributes.filter(
      (a) =>
        normalize(a.nombre).includes(q) ||
        normalize(a.codigo).includes(q) ||
        normalize(a.tipo).includes(q),
    )
  }, [selectedSubgroupAttributes, modalAttrFilter])

  const filteredDomainValues = useMemo(() => {
    if (!openAtributo?.dominio) return []
    const q = normalize(domainFilter).trim()
    if (!q) return openAtributo.dominio
    return openAtributo.dominio.filter(
      (v) =>
        normalize(v.codigo).includes(q) ||
        normalize(v.etiqueta).includes(q) ||
        normalize(v.shortName).includes(q) ||
        normalize(v.definicion).includes(q),
    )
  }, [openAtributo, domainFilter])

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50/60 via-slate-50 to-teal-50/60">
      <div className="container mx-auto px-4 py-6">
        {/* Sticky Institutional Header */}
        <div className="sticky top-0 z-50 bg-gradient-to-r from-[#1a4731] via-[#2d6a4f] to-[#40916c] text-white shadow-md rounded-xl mb-6 px-6 py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
                <Database className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-balance">
                  DGIWG Feature Data Dictionary (DFDD)
                </h1>
                <p className="text-xs sm:text-sm text-emerald-100">
                  Defence Geospatial Information Working Group · Baseline 2013-1.00 (FAD Registry)
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-white/20 text-white border-white/30 hover:bg-white/25">ISO 19126 (FCD)</Badge>
              <Badge className="bg-white/20 text-white border-white/30 hover:bg-white/25">ISO 19135</Badge>
              <Badge className="bg-white/20 text-white border-white/30 hover:bg-white/25">ISO 19110</Badge>
              <a
                href="https://www.dgiwg.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md bg-white/15 hover:bg-white/25 border border-white/30 px-2.5 py-1 text-xs font-medium text-white transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                dgiwg.org
              </a>
            </div>
          </div>
        </div>

        {/* Information Banner (Cover sheet + DGIWG standards context) */}
        <Card className="mb-6 border-2 border-emerald-200 bg-gradient-to-r from-white to-emerald-50/50 shadow-sm">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <h3 className="font-bold text-xs uppercase tracking-wider text-emerald-800 mb-1">
                    Alcance y Contexto DGIWG
                  </h3>
                  <p className="text-sm text-gray-800 leading-relaxed">
                    El <strong>DGIWG Feature Data Dictionary (DFDD)</strong> es el diccionario conceptual estandarizado
                    del <em>Defence Geospatial Information Working Group</em> (mantenido por el equipo{" "}
                    <em>Feature and Attribute Data - FAD</em>), conforme a <strong>ISO 19126</strong>,{" "}
                    <strong>ISO 19135</strong> e <strong>ISO 19110</strong>. Utiliza códigos <strong>5-3-1</strong>{" "}
                    heredados de DIGEST/FACC para garantizar interoperabilidad semántica en cartografía y sistemas de
                    defensa (MGCP, esquemas de aplicación).
                  </p>
                  <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                    <strong>Evolución del estándar:</strong> en la arquitectura actual de DGIWG (<strong>DGIF</strong>),
                    el DFDD fue sucedido funcionalmente por <strong>DGIWG 206 (DGFCD)</strong> junto con{" "}
                    <strong>DGIWG 205 (DGIM)</strong> y <strong>DGIWG 207 (DGRWI)</strong>.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-4 pt-1">
                  <div>
                    <h3 className="font-bold text-xs uppercase tracking-wider text-emerald-800 mb-0.5">Versión</h3>
                    <p className="text-sm font-medium text-gray-900">BL 2013-1.00</p>
                  </div>
                  <div>
                    <h3 className="font-bold text-xs uppercase tracking-wider text-emerald-800 mb-0.5">Preparado</h3>
                    <p className="text-sm font-medium text-gray-900">26 May 2014</p>
                  </div>
                  <div>
                    <h3 className="font-bold text-xs uppercase tracking-wider text-emerald-800 mb-0.5">Idioma</h3>
                    <p className="text-sm font-medium text-gray-900">English (OED)</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="font-bold text-xs uppercase tracking-wider text-emerald-800 mb-2">
                    Cobertura del Diccionario
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg border border-emerald-200 bg-white p-2.5 text-center">
                      <div className="text-lg font-bold text-emerald-800">{stats.grupos}</div>
                      <div className="text-[11px] text-gray-600">Grupos</div>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-white p-2.5 text-center">
                      <div className="text-lg font-bold text-emerald-800">{stats.subgrupos}</div>
                      <div className="text-[11px] text-gray-600">Subgrupos</div>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-white p-2.5 text-center">
                      <div className="text-lg font-bold text-emerald-800">{stats.objetosUnicos}</div>
                      <div className="text-[11px] text-gray-600">Feature Concepts</div>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-white p-2.5 text-center">
                      <div className="text-lg font-bold text-emerald-800">{stats.atributos}</div>
                      <div className="text-[11px] text-gray-600">Attribute Concepts</div>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-white p-2.5 text-center">
                      <div className="text-lg font-bold text-emerald-800">{stats.datatypes}</div>
                      <div className="text-[11px] text-gray-600">Datatypes</div>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-white p-2.5 text-center">
                      <div className="text-lg font-bold text-emerald-800">{stats.dominios.toLocaleString("es-AR")}</div>
                      <div className="text-[11px] text-gray-600">Valores Dominio</div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-bold text-xs uppercase tracking-wider text-emerald-800 mb-1.5">
                    Referencias Oficiales DGIWG
                  </h3>
                  <div className="flex flex-wrap gap-3 text-xs">
                    <a
                      href="https://www.dgiwg.org/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900 underline font-medium"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Portal DGIWG
                    </a>
                    <a
                      href="https://www.dgiwg.org/FAD/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900 underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      DGIWG FAD Registry (URI histórica)
                    </a>
                    <a
                      href="https://geo.aitcnet.org/FAD/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900 underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Mirror AITCNet
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Content */}
        <div id="main-content" className="space-y-6 scroll-mt-28">
          {/* Navigation & Global Search */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              {currentLevel !== "categories" && (
                <Button
                  variant="outline"
                  onClick={handleBackNavigation}
                  className="flex items-center gap-2 bg-white border-emerald-300 text-emerald-900 hover:bg-emerald-50"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Volver
                </Button>
              )}

              {/* Breadcrumbs */}
              {!searchResults && currentLevel !== "categories" && selectedCategory && (
                <nav aria-label="Ruta de navegación" className="flex items-center gap-1 text-xs text-gray-600">
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentLevel("categories")
                      setSelectedCategory(null)
                      setSelectedSubcategory(null)
                    }}
                    className="hover:text-emerald-800 font-medium underline-offset-2 hover:underline"
                  >
                    Grupos
                  </button>
                  <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                  <button
                    type="button"
                    onClick={() => handleCategorySelect(selectedCategory)}
                    className={`hover:text-emerald-800 ${
                      currentLevel === "subcategories" ? "font-semibold text-emerald-900" : "hover:underline"
                    }`}
                  >
                    {selectedCategory.codigo} · {selectedCategory.nombre}
                  </button>
                  {currentLevel === "objects" && selectedSubcategory && (
                    <>
                      <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                      <span className="font-semibold text-emerald-900">
                        {selectedSubcategory.codigo} · {selectedSubcategory.nombre}
                      </span>
                    </>
                  )}
                </nav>
              )}
            </div>

            <div className="relative flex-1 max-w-2xl sm:ml-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                id="global-search-input"
                type="search"
                aria-label="Buscar en el DFDD"
                placeholder="Buscar grupos, subgrupos, objetos (ej. FA005, Bridge), atributos o dominios..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setSearchTerm("")}
                className="pl-10 pr-10 bg-white border-emerald-200 focus-visible:ring-emerald-500 [&::-webkit-search-cancel-button]:hidden"
              />
              {searchTerm && (
                <button
                  type="button"
                  id="global-search-clear"
                  aria-label="Limpiar búsqueda"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {!atributosLoaded && (
            <p className="text-xs text-emerald-700">Cargando diccionario completo de atributos y dominios...</p>
          )}

          {/* Global Search Results */}
          {searchResults && (
            <SearchResults
              results={searchResults}
              rawQuery={debouncedSearchTerm.trim()}
              getCategoryConfig={getCategoryConfig}
              onSelectCategoria={handleSearchSelectCategoria}
              onSelectSubcategoria={handleSearchSelectSubcategoria}
              onSelectObjeto={handleSearchSelectObjeto}
              onSelectAtributo={handleSearchSelectAtributo}
            />
          )}

          {/* Level 1: Groups */}
          {!searchResults && currentLevel === "categories" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {data.map((categoria: Categoria) => {
                const config = getCategoryConfig(categoria.codigo)
                const IconComponent = config.icon
                const uniqueObj = new Set<string>()
                const uniqueAttr = new Set<string>()
                for (const sub of categoria.subcategorias) {
                  for (const o of sub.objetos) uniqueObj.add(o.codigo)
                  for (const a of sub.atributosCodigos) uniqueAttr.add(a)
                }

                return (
                  <div
                    key={categoria.codigo}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleCategorySelect(categoria)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleCategorySelect(categoria)}
                    className={`${config.color} ${config.hoverColor} cursor-pointer transition-all duration-200 hover:scale-[1.02] border-2 rounded-xl p-4 min-h-[145px] flex flex-col justify-between items-center text-center shadow-sm`}
                  >
                    <div className={`${config.circleColor} rounded-full p-3 mb-2 shadow-sm`}>
                      <IconComponent className="h-7 w-7 text-white" />
                    </div>
                    <div className="font-bold text-sm leading-tight mb-1">{categoria.nombre}</div>
                    <div className="text-[11px] font-mono text-gray-500 mb-2">{categoria.alphaCode}</div>
                    <div className="flex flex-col items-center gap-1 w-full">
                      <Badge variant="outline" className="text-xs bg-white/80 border-gray-300 font-mono">
                        Group {categoria.codigo}
                      </Badge>
                      <div className="text-[11px] text-gray-700">
                        {categoria.subcategorias.length} subgrupos · {uniqueObj.size} OG · {uniqueAttr.size} atrib.
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Level 2: Subgroups */}
          {!searchResults && currentLevel === "subcategories" && selectedCategory && (
            <div className="space-y-4">
              <Card className="border-2 border-emerald-200 shadow-sm bg-white">
                <CardHeader>
                  <div className="flex items-start gap-3">
                    {(() => {
                      const config = getCategoryConfig(selectedCategory.codigo)
                      const IconComponent = config.icon
                      return (
                        <div className={`p-3 rounded-lg ${config.circleColor} shrink-0`}>
                          <IconComponent className="h-6 w-6 text-white" />
                        </div>
                      )
                    })()}
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Badge variant="outline" className="font-mono">
                          Group {selectedCategory.codigo}
                        </Badge>
                        <Badge variant="secondary" className="font-mono">
                          {selectedCategory.alphaCode}
                        </Badge>
                      </div>
                      <CardTitle className="text-xl mb-2 text-gray-900">{selectedCategory.nombre}</CardTitle>
                      <p className="text-sm text-gray-800 leading-relaxed">{selectedCategory.contenido}</p>
                      {selectedCategory.descripcion && (
                        <p className="text-xs text-gray-600 mt-2 leading-relaxed">{selectedCategory.descripcion}</p>
                      )}
                    </div>
                  </div>
                </CardHeader>
              </Card>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {selectedCategory.subcategorias.map((subcategoria: Subcategoria) => {
                  const config = getCategoryConfig(selectedCategory.codigo)
                  return (
                    <div
                      key={subcategoria.codigo}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSubcategorySelect(subcategoria)}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleSubcategorySelect(subcategoria)}
                      className={`${config.color} ${config.hoverColor} cursor-pointer transition-all duration-200 hover:scale-[1.02] border-2 rounded-xl p-4 min-h-[120px] flex flex-col justify-between items-center text-center shadow-sm`}
                    >
                      <div className={`${config.circleColor} rounded-full p-2 mb-2`}>
                        <Layers className="h-5 w-5 text-white" />
                      </div>
                      <div className="font-bold text-sm leading-tight mb-1">{subcategoria.nombre}</div>
                      <div className="text-[11px] font-mono text-gray-500 mb-2">{subcategoria.alphaCode}</div>
                      <div className="flex flex-col items-center gap-1">
                        <Badge variant="outline" className="text-xs bg-white/80 border-gray-300 font-mono">
                          {subcategoria.codigo}
                        </Badge>
                        <div className="text-xs text-gray-700">
                          {subcategoria.objetos.length} Feature Concepts · {subcategoria.atributosCodigos.length} Atributos
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Level 3: Subgroup Feature Concepts & Attribute Concepts */}
          {!searchResults && currentLevel === "objects" && selectedSubcategory && (
            <div className="space-y-4">
              <Card className="border-2 border-emerald-200 shadow-sm bg-white">
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-lg bg-emerald-100 text-emerald-800 shrink-0">
                      <Layers className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Badge variant="outline" className="font-mono">
                          Subgroup {selectedSubcategory.codigo}
                        </Badge>
                        <Badge variant="secondary" className="font-mono">
                          {selectedSubcategory.alphaCode}
                        </Badge>
                      </div>
                      <CardTitle className="text-xl mb-2 text-gray-900">{selectedSubcategory.nombre}</CardTitle>
                      <p className="text-sm text-gray-800 leading-relaxed">{selectedSubcategory.contenido}</p>
                      {selectedSubcategory.descripcion && (
                        <p className="text-xs text-gray-600 mt-2 leading-relaxed">{selectedSubcategory.descripcion}</p>
                      )}
                    </div>
                  </div>
                </CardHeader>
              </Card>

              <Tabs value={subgroupTab} onValueChange={(v) => setSubgroupTab(v as "objects" | "attributes")}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <TabsList className="bg-emerald-100/70">
                    <TabsTrigger value="objects" className="gap-1.5">
                      <MapPin className="h-4 w-4" />
                      Feature Concepts ({selectedSubcategory.objetos.length})
                    </TabsTrigger>
                    <TabsTrigger value="attributes" className="gap-1.5">
                      <FileText className="h-4 w-4" />
                      Attribute Concepts ({selectedSubcategory.atributosCodigos.length})
                    </TabsTrigger>
                  </TabsList>

                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                    <Input
                      type="search"
                      placeholder={
                        subgroupTab === "objects" ? "Filtrar Feature Concepts..." : "Filtrar Attribute Concepts..."
                      }
                      value={subgroupFilter}
                      onChange={(e) => setSubgroupFilter(e.target.value)}
                      className="pl-8 pr-8 h-9 text-sm bg-white border-emerald-200 [&::-webkit-search-cancel-button]:hidden"
                    />
                    {subgroupFilter && (
                      <button
                        type="button"
                        onClick={() => setSubgroupFilter("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Feature Concepts Tab */}
                <TabsContent value="objects" className="mt-4">
                  {filteredSubgroupObjects.length === 0 ? (
                    <Card className="border-dashed border-2 border-gray-300 bg-white/70">
                      <CardContent className="py-10 text-center text-sm text-gray-600">
                        {selectedSubcategory.objetos.length === 0
                          ? "Este subgrupo no contiene Feature Concepts en el DFDD; consultá la pestaña Attribute Concepts."
                          : "No hay Feature Concepts que coincidan con el filtro."}
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredSubgroupObjects.map((objeto: Objeto) => {
                        const isExpanded = expandedDefinitions.has(objeto.codigo)
                        const needsExpansion = objeto.definicion.length > 180

                        return (
                          <Card
                            key={objeto.codigo}
                            className="transition-all duration-200 hover:shadow-lg border-2 border-gray-200 hover:border-emerald-300 bg-white flex flex-col justify-between"
                          >
                            <CardHeader className="pb-2">
                              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                                <Badge variant="outline" className="text-xs font-mono border-emerald-300 text-emerald-900">
                                  {objeto.codigo}
                                </Badge>
                                <Badge variant="secondary" className="text-xs font-mono">
                                  {objeto.shortName}
                                </Badge>
                                {objeto.itemIdentifier && (
                                  <Badge variant="outline" className="text-[11px] text-gray-500">
                                    ID: {objeto.itemIdentifier}
                                  </Badge>
                                )}
                              </div>
                              <CardTitle className="text-lg leading-tight">{objeto.nombre}</CardTitle>
                              {objeto.aliases && (
                                <p className="text-xs text-gray-500 mt-1">
                                  <span className="font-medium">Alias:</span> {objeto.aliases}
                                </p>
                              )}
                            </CardHeader>

                            <CardContent className="space-y-4">
                              <div>
                                <div
                                  className={`text-sm text-gray-800 leading-relaxed ${
                                    !isExpanded && needsExpansion ? "line-clamp-3" : ""
                                  }`}
                                >
                                  {objeto.definicion}
                                </div>
                                {needsExpansion && (
                                  <button
                                    type="button"
                                    onClick={() => toggleDefinition(objeto.codigo)}
                                    className="text-xs text-emerald-700 hover:text-emerald-900 mt-1 font-medium"
                                  >
                                    {isExpanded ? "Leer menos" : "Leer más"}
                                  </button>
                                )}
                              </div>

                              {objeto.subgrupos.length > 1 && (
                                <div className="flex flex-wrap gap-1">
                                  {objeto.subgrupos.map((sg) => (
                                    <Badge
                                      key={sg}
                                      variant="outline"
                                      className={`text-[11px] font-mono ${
                                        sg === selectedSubcategory.codigo
                                          ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                                          : "text-gray-500"
                                      }`}
                                    >
                                      {sg}
                                    </Badge>
                                  ))}
                                </div>
                              )}

                              <div className="flex flex-wrap gap-2 pt-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="flex-1 bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100"
                                  onClick={() => {
                                    setModalAttrFilter("")
                                    setOpenObjeto(objeto)
                                  }}
                                >
                                  <FileText className="h-3.5 w-3.5 mr-1.5" />
                                  Detalle y Atributos
                                </Button>
                                {objeto.url && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="bg-white"
                                    title="Abrir en DGIWG FAD Registry"
                                    onClick={() => window.open(objeto.url, "_blank", "noopener,noreferrer")}
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        )
                      })}
                    </div>
                  )}
                </TabsContent>

                {/* Attribute Concepts Tab */}
                <TabsContent value="attributes" className="mt-4">
                  {filteredSubgroupAttributes.length === 0 ? (
                    <Card className="border-dashed border-2 border-gray-300 bg-white/70">
                      <CardContent className="py-10 text-center text-sm text-gray-600">
                        {selectedSubcategory.atributosCodigos.length === 0
                          ? "Este subgrupo no tiene Attribute Concepts asociados en el DFDD."
                          : "No hay Attribute Concepts que coincidan con el filtro."}
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredSubgroupAttributes.map((attr) => (
                        <Card
                          key={attr.codigo}
                          className="transition-all duration-200 hover:shadow-lg border-2 border-gray-200 hover:border-emerald-300 bg-white flex flex-col justify-between"
                        >
                          <CardHeader className="pb-2">
                            <div className="flex flex-wrap items-center gap-1.5 mb-2">
                              <Badge variant="outline" className="text-xs font-mono border-emerald-300 text-emerald-900">
                                {attr.codigo}
                              </Badge>
                              <Badge variant="secondary" className="text-xs font-mono">
                                {attr.tipo}
                              </Badge>
                              {attr.dominio && attr.dominio.length > 0 && (
                                <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 text-xs">
                                  {attr.dominio.length} valores
                                </Badge>
                              )}
                            </div>
                            <CardTitle className="text-base leading-tight">{attr.nombre}</CardTitle>
                            <p className="text-[11px] font-mono text-gray-500">{attr.shortName}</p>
                          </CardHeader>

                          <CardContent className="space-y-3">
                            <p className="text-xs text-gray-700 leading-relaxed line-clamp-3">{attr.definicion}</p>

                            <div className="flex flex-wrap gap-1.5 text-[11px]">
                              {attr.cantidadFisica && (
                                <Badge variant="outline" className="text-[11px]">
                                  <Ruler className="h-3 w-3 mr-1" />
                                  {attr.cantidadFisica.nombre}
                                </Badge>
                              )}
                              {attr.unidadRecomendada && (
                                <Badge variant="outline" className="text-[11px] bg-blue-50/70 border-blue-200 text-blue-800">
                                  {attr.unidadRecomendada.nombre}
                                </Badge>
                              )}
                            </div>

                            <div className="flex gap-2 pt-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100"
                                onClick={() => {
                                  setDomainFilter("")
                                  setOpenAtributo(attr)
                                }}
                              >
                                <FileText className="h-3.5 w-3.5 mr-1.5" />
                                Ver especificación
                              </Button>
                              {attr.url && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => window.open(attr.url, "_blank", "noopener,noreferrer")}
                                  title="Abrir en DGIWG FAD Registry"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </div>

      {/* Controlled Feature Concept Detail Dialog */}
      <Dialog open={Boolean(openObjeto)} onOpenChange={(open) => !open && setOpenObjeto(null)}>
        {openObjeto && (
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 text-xl">
                <MapPin className="h-5 w-5 text-emerald-700 shrink-0" />
                {openObjeto.nombre}
              </DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-2 pt-2">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="font-mono">
                      5-3-1 Code: {openObjeto.codigo}
                    </Badge>
                    <Badge variant="secondary" className="font-mono">
                      Short Name: {openObjeto.shortName}
                    </Badge>
                    {openObjeto.itemIdentifier && (
                      <Badge variant="outline" className="font-mono">
                        Item ID: {openObjeto.itemIdentifier}
                      </Badge>
                    )}
                  </div>
                </div>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 mt-2">
              <div>
                <h4 className="font-semibold text-sm text-gray-800 mb-1">Definición</h4>
                <p className="text-sm text-gray-700 leading-relaxed">{openObjeto.definicion}</p>
              </div>

              {openObjeto.descripcion && (
                <div>
                  <h4 className="font-semibold text-sm text-gray-800 mb-1">Descripción</h4>
                  <p className="text-sm text-gray-700 leading-relaxed">{openObjeto.descripcion}</p>
                </div>
              )}

              {openObjeto.aliases && (
                <div>
                  <h4 className="font-semibold text-sm text-gray-800 mb-1">Alias(es)</h4>
                  <p className="text-sm text-gray-700">{openObjeto.aliases}</p>
                </div>
              )}

              <div>
                <h4 className="font-semibold text-sm text-gray-800 mb-1.5">
                  Subgrupos en el DFDD ({openObjeto.subgrupos.length})
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {openObjeto.subgrupos.map((sgCode) => {
                    const sgRef = subgroupLookup.get(sgCode)
                    return (
                      <button
                        key={sgCode}
                        type="button"
                        onClick={() => handleNavigateSubgroupCode(sgCode)}
                        className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                      >
                        {sgCode} · {sgRef?.subcategoria.nombre ?? sgCode}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
                {openObjeto.url && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(openObjeto.url, "_blank", "noopener,noreferrer")}
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    DGIWG FAD Registry
                  </Button>
                )}
                {openObjeto.itemIdentifier && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      window.open(
                        `https://geo.aitcnet.org/FAD/fdd/view?i=${openObjeto.itemIdentifier}`,
                        "_blank",
                        "noopener,noreferrer",
                      )
                    }
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    Mirror AITCNet
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    downloadJson(`${getObjectSlug(openObjeto.codigo, openObjeto.nombre)}.json`, {
                      featureConcept: openObjeto,
                      subgroup: selectedSubcategory?.codigo ?? null,
                      subgroupAttributes: selectedSubgroupAttributes.map((a) => ({
                        codigo: a.codigo,
                        shortName: a.shortName,
                        nombre: a.nombre,
                        tipo: a.tipo,
                      })),
                    })
                  }
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Exportar JSON
                </Button>
              </div>

              {/* Subgroup-level Attribute Concepts */}
              {selectedSubcategory && (
                <div className="pt-3 border-t border-gray-200 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="font-semibold text-sm text-gray-800">
                        Attribute Concepts del subgrupo {selectedSubcategory.codigo} ({selectedSubgroupAttributes.length})
                      </h4>
                      <p className="text-xs text-gray-500">
                        En el DFDD, los atributos se clasifican por subgrupo temático. Hacé clic en uno para ver su
                        tipo de dato y dominio.
                      </p>
                    </div>
                    {selectedSubgroupAttributes.length > 6 && (
                      <Input
                        type="search"
                        placeholder="Filtrar atributos..."
                        value={modalAttrFilter}
                        onChange={(e) => setModalAttrFilter(e.target.value)}
                        className="h-8 text-xs sm:w-48"
                      />
                    )}
                  </div>

                  {filteredModalAttributes.length === 0 ? (
                    <p className="text-xs italic text-gray-500">No hay atributos coincidentes en este subgrupo.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                      {filteredModalAttributes.map((attr) => (
                        <button
                          key={attr.codigo}
                          type="button"
                          onClick={() => {
                            setDomainFilter("")
                            setOpenAtributo(attr)
                          }}
                          className="text-left p-2.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-emerald-50 hover:border-emerald-300 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <Badge variant="outline" className="text-[11px] font-mono bg-white">
                              {attr.codigo}
                            </Badge>
                            <span className="text-[11px] font-mono text-gray-500 truncate">{attr.tipo}</span>
                          </div>
                          <div className="text-xs font-semibold text-gray-900 mt-1 line-clamp-1">{attr.nombre}</div>
                          {attr.dominio && attr.dominio.length > 0 && (
                            <div className="text-[11px] text-amber-800 mt-0.5">{attr.dominio.length} valores</div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* Controlled Attribute Concept Detail Dialog */}
      <Dialog open={Boolean(openAtributo)} onOpenChange={(open) => !open && setOpenAtributo(null)}>
        {openAtributo && (
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 text-xl">
                <FileText className="h-5 w-5 text-emerald-700 shrink-0" />
                {openAtributo.nombre}
              </DialogTitle>
              <DialogDescription asChild>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Badge variant="outline" className="font-mono">
                    5-3-1 Code: {openAtributo.codigo}
                  </Badge>
                  <Badge variant="secondary" className="font-mono">
                    Short Name: {openAtributo.shortName}
                  </Badge>
                  {openAtributo.multiplicidad && (
                    <Badge variant="outline">Multiplicidad: {openAtributo.multiplicidad}</Badge>
                  )}
                  {openAtributo.coleccion && <Badge variant="outline">Colección: {openAtributo.coleccion}</Badge>}
                  {openAtributo.itemIdentifier && (
                    <Badge variant="outline" className="font-mono">
                      Item ID: {openAtributo.itemIdentifier}
                    </Badge>
                  )}
                </div>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 mt-2">
              <div>
                <h4 className="font-semibold text-sm text-gray-800 mb-1">Definición</h4>
                <p className="text-sm text-gray-700 leading-relaxed">{openAtributo.definicion}</p>
              </div>

              {openAtributo.descripcion && (
                <div>
                  <h4 className="font-semibold text-sm text-gray-800 mb-1">Descripción</h4>
                  <p className="text-sm text-gray-700 leading-relaxed">{openAtributo.descripcion}</p>
                </div>
              )}

              {openAtributo.aliases && (
                <div>
                  <h4 className="font-semibold text-sm text-gray-800 mb-1">Alias(es)</h4>
                  <p className="text-sm text-gray-700">{openAtributo.aliases}</p>
                </div>
              )}

              {/* Datatype specification */}
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-semibold text-sm text-emerald-950">
                    Tipo de Dato (Datatype): <span className="font-mono">{openAtributo.tipo}</span>
                  </h4>
                  {openAtributo.tipoEspecificacion && (
                    <Badge variant="secondary" className="font-mono text-xs">
                      {openAtributo.tipoEspecificacion}
                    </Badge>
                  )}
                </div>

                {openAtributo.datatype && (
                  <div className="space-y-1.5 text-xs text-gray-700">
                    <p className="font-medium text-gray-900">{openAtributo.datatype.nombre}</p>
                    {openAtributo.datatype.definicion && <p>{openAtributo.datatype.definicion}</p>}
                    {openAtributo.datatype.nota && (
                      <p className="italic text-gray-600">Nota: {openAtributo.datatype.nota}</p>
                    )}

                    <div className="flex flex-wrap gap-3 pt-1">
                      {openAtributo.datatype.longitud !== null && openAtributo.datatype.longitud !== "" && (
                        <span>
                          <strong>Longitud máx.:</strong> {openAtributo.datatype.longitud}
                        </span>
                      )}
                      {openAtributo.datatype.rangoMin && (
                        <span>
                          <strong>Mín.:</strong> {openAtributo.datatype.rangoMin}
                        </span>
                      )}
                      {openAtributo.datatype.rangoMax && (
                        <span>
                          <strong>Máx.:</strong> {openAtributo.datatype.rangoMax}
                        </span>
                      )}
                      {openAtributo.completa !== null && (
                        <span>
                          <strong>Dominio completo:</strong> {openAtributo.completa ? "Sí" : "No (extensible)"}
                        </span>
                      )}
                    </div>

                    {openAtributo.datatype.estructura && (
                      <div className="mt-2 p-2 rounded bg-white border border-emerald-100 text-xs leading-relaxed">
                        <strong>Estructura:</strong> {openAtributo.datatype.estructura}
                      </div>
                    )}

                    {openAtributo.datatype.campos && openAtributo.datatype.campos.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <div className="font-semibold text-gray-800">Campos del tipo complejo:</div>
                        {openAtributo.datatype.campos.map((campo, idx) => (
                          <div key={idx} className="p-2 rounded bg-white border border-gray-200 text-xs">
                            <span className="font-mono font-semibold">{campo.shortName}</span> — {campo.nombre} (
                            <span className="font-mono text-emerald-800">{campo.codigo}</span>)
                            {campo.definicion && <p className="text-gray-600 mt-0.5">{campo.definicion}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Physical Quantity & Units of Measure */}
              {(openAtributo.cantidadFisica || openAtributo.unidadRecomendada || openAtributo.unidadNoComparable) && (
                <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3.5 space-y-1.5 text-xs">
                  <h4 className="font-semibold text-sm text-blue-950 flex items-center gap-1.5">
                    <Ruler className="h-4 w-4" />
                    Magnitud Física y Unidad de Medida
                  </h4>
                  {openAtributo.cantidadFisica && (
                    <p className="text-gray-800">
                      <strong>Magnitud física:</strong> {openAtributo.cantidadFisica.nombre} —{" "}
                      <span className="text-gray-600">{openAtributo.cantidadFisica.definicion}</span>
                    </p>
                  )}
                  {openAtributo.unidadRecomendada && (
                    <p className="text-gray-800">
                      <strong>Unidad recomendada:</strong> {openAtributo.unidadRecomendada.nombre} (
                      <span className="font-mono">{openAtributo.unidadRecomendada.shortName}</span>)
                      {openAtributo.unidadRecomendada.additionalCodes && (
                        <span className="text-gray-500"> · {openAtributo.unidadRecomendada.additionalCodes}</span>
                      )}
                    </p>
                  )}
                  {openAtributo.unidadNoComparable && (
                    <p className="text-gray-800">
                      <strong>Unidad no comparable:</strong> {openAtributo.unidadNoComparable}
                    </p>
                  )}
                </div>
              )}

              {openAtributo.additionalCodes && (
                <div className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-md p-2.5">
                  <strong>Códigos adicionales (GIFD / MGCP):</strong> {openAtributo.additionalCodes}
                </div>
              )}

              {/* Listed Values / Domain */}
              {openAtributo.dominio && openAtributo.dominio.length > 0 && (
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <h4 className="font-semibold text-sm text-gray-800">
                      Valores de Dominio ({openAtributo.dominio.length})
                    </h4>
                    {openAtributo.dominio.length > 8 && (
                      <Input
                        type="search"
                        placeholder="Filtrar valores de dominio..."
                        value={domainFilter}
                        onChange={(e) => setDomainFilter(e.target.value)}
                        className="h-8 text-xs sm:w-56"
                      />
                    )}
                  </div>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1 border border-gray-200 rounded-lg p-2 bg-gray-50/60">
                    {filteredDomainValues.map((val, idx) => (
                      <div key={idx} className="p-2 rounded bg-white border border-gray-200 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="font-mono text-[11px]">
                            {val.codigo}
                          </Badge>
                          <span className="font-semibold text-gray-900">{val.etiqueta}</span>
                          <span className="font-mono text-[11px] text-gray-400">{val.shortName}</span>
                        </div>
                        {val.definicion && <p className="text-gray-600 mt-1">{val.definicion}</p>}
                        {val.observaciones && <p className="text-gray-500 italic mt-0.5">{val.observaciones}</p>}
                      </div>
                    ))}
                    {filteredDomainValues.length === 0 && (
                      <p className="text-xs text-gray-500 text-center py-4">Sin valores coincidentes.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Subgroups */}
              <div>
                <h4 className="font-semibold text-sm text-gray-800 mb-1.5">
                  Subgrupos DFDD ({openAtributo.subgrupos.length})
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {openAtributo.subgrupos.map((sgCode) => {
                    const sgRef = subgroupLookup.get(sgCode)
                    return (
                      <button
                        key={sgCode}
                        type="button"
                        onClick={() => handleNavigateSubgroupCode(sgCode)}
                        className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800 hover:bg-emerald-100"
                      >
                        {sgCode} · {sgRef?.subcategoria.nombre ?? sgCode}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
                {openAtributo.url && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(openAtributo.url, "_blank", "noopener,noreferrer")}
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    DGIWG FAD Registry
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    downloadJson(`${getObjectSlug(openAtributo.codigo, openAtributo.nombre)}.json`, openAtributo)
                  }
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Exportar JSON
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
