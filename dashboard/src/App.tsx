import { useEffect, useMemo, useState } from "react"
import axios from "axios"

import {
  Activity,
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Database,
  Download,
  Filter,
  Globe2,
  LayoutDashboard,
  LineChart as LineChartIcon,
  Package,
  RefreshCw,
  Search,
  Server,
  ShoppingCart,
  SlidersHorizontal,
  TrendingUp,

  Zap,
 
X,
} from "lucide-react"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import "./index.css"


const API_BASE =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";


type FiltersResponse = {
  states: string[]
  categories: string[]
  statuses: string[]
  date_range: {
    min: string | null
    max: string | null
  }
}


type SummaryData = {
  total_orders: number
  total_items: number
  total_revenue: number
  average_item_price: number
}


type StateData = {
  state: string
  total_orders: number
  total_revenue: number
}


type CategoryData = {
  category: string
  items_sold: number
  total_revenue: number
}


type TrendData = {
  date: string
  total_orders: number
  total_items: number
  total_revenue: number
}


type TabType =
  | "overview"
  | "states"
  | "categories"
  | "trends"


function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0)
}


function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(
    Number(value) || 0
  )
}


function formatCompactCurrency(value: number) {
  const numericValue = Number(value) || 0

  if (numericValue >= 1_000_000_000) {
    return `R$ ${(numericValue / 1_000_000_000).toFixed(1)}B`
  }

  if (numericValue >= 1_000_000) {
    return `R$ ${(numericValue / 1_000_000).toFixed(1)}M`
  }

  if (numericValue >= 1_000) {
    return `R$ ${(numericValue / 1_000).toFixed(1)}K`
  }

  return `R$ ${numericValue.toFixed(0)}`
}


function formatDate(date: string) {
  if (!date) return ""

  const parsed = new Date(`${date}T00:00:00`)

  if (Number.isNaN(parsed.getTime())) {
    return date
  }

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}


function getInitialDate(value: string | null) {
  if (!value) return ""
  return value.slice(0, 10)
}


function formatCategoryName(category: string) {
  if (!category) return ""

  if (category.toLowerCase() === "unknown") {
    return "Unknown"
  }

  return category
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    )
}


function App() {
  const [activeTab, setActiveTab] =
    useState<TabType>("overview")

  const [filters, setFilters] =
    useState<FiltersResponse | null>(null)

  const [summary, setSummary] =
    useState<SummaryData>({
      total_orders: 0,
      total_items: 0,
      total_revenue: 0,
      average_item_price: 0,
    })

  const [states, setStates] =
    useState<StateData[]>([])

  const [categories, setCategories] =
    useState<CategoryData[]>([])

  const [trend, setTrend] =
    useState<TrendData[]>([])

  const [startDate, setStartDate] =
    useState("")

  const [endDate, setEndDate] =
    useState("")

  const [selectedState, setSelectedState] =
    useState("")

  const [selectedCategory, setSelectedCategory] =
    useState("")

  const [selectedStatus, setSelectedStatus] =
    useState("delivered")

  const [search, setSearch] =
    useState("")

  const [loading, setLoading] =
    useState(true)

  const [refreshing, setRefreshing] =
    useState(false)

  const [error, setError] =
    useState("")

  const [apiOnline, setApiOnline] =
    useState(false)

  const [stateLimit, setStateLimit] =
    useState("10")

  const [categoryLimit, setCategoryLimit] =
    useState("10")


  const averageOrderValue = useMemo(() => {
    if (summary.total_orders <= 0) {
      return 0
    }

    return (
      Number(summary.total_revenue || 0) /
      Number(summary.total_orders || 1)
    )
  }, [
    summary.total_revenue,
    summary.total_orders,
  ])


  const activeFilterCount = useMemo(() => {
    const defaultMinDate =
      filters?.date_range?.min
        ? String(
            filters.date_range.min
          ).slice(0, 10)
        : ""

    const defaultMaxDate =
      filters?.date_range?.max
        ? String(
            filters.date_range.max
          ).slice(0, 10)
        : ""

    const customDateFilter =
      Boolean(
        startDate &&
        startDate !== defaultMinDate
      ) ||
      Boolean(
        endDate &&
        endDate !== defaultMaxDate
      )

    return [
      selectedState,
      selectedCategory,
      selectedStatus !== "delivered"
        ? selectedStatus
        : "",
      search.trim(),
      customDateFilter
        ? "date"
        : "",
    ].filter(Boolean).length
  }, [
    filters,
    startDate,
    endDate,
    selectedState,
    selectedCategory,
    selectedStatus,
    search,
  ])


  const buildParams = () => {
    const params = new URLSearchParams()

    if (startDate) {
      params.set("start_date", startDate)
    }

    if (endDate) {
      params.set("end_date", endDate)
    }

    if (selectedState) {
      params.set("state", selectedState)
    }

    if (selectedCategory) {
      params.set("category", selectedCategory)
    }

    if (selectedStatus) {
      params.set(
        "order_status",
        selectedStatus
      )
    }

    if (search.trim()) {
      params.set(
        "search",
        search.trim()
      )
    }

    return params
  }


  const loadFilters = async () => {
    const response =
      await axios.get<FiltersResponse>(
        `${API_BASE_URL}/olist/filters`
      )

    const data = response.data

    setFilters(data)

    const minDate =
      data.date_range?.min
        ? String(
            data.date_range.min
          ).slice(0, 10)
        : ""

    const maxDate =
      data.date_range?.max
        ? String(
            data.date_range.max
          ).slice(0, 10)
        : ""

    setStartDate(
      (current) =>
        current || minDate
    )

    setEndDate(
      (current) =>
        current || maxDate
    )

    return data
  }


  const loadDashboard = async (
    customParams?: URLSearchParams
  ) => {
    const params =
      customParams || buildParams()

    const query =
      params.toString()

    const [
      summaryResponse,
      statesResponse,
      categoriesResponse,
      trendResponse,
    ] = await Promise.all([
      axios.get<SummaryData>(
        `${API_BASE_URL}/olist/analytics/summary?${query}`
      ),

      axios.get(
        `${API_BASE_URL}/olist/analytics/states?${query}`
      ),

      axios.get(
        `${API_BASE_URL}/olist/analytics/categories?${query}`
      ),

      axios.get(
        `${API_BASE_URL}/olist/analytics/trend?${query}`
      ),
    ])


    const summaryData =
      summaryResponse.data

    setSummary({
      total_orders: Number(
        summaryData.total_orders ?? 0
      ),
      total_items: Number(
        summaryData.total_items ?? 0
      ),
      total_revenue: Number(
        summaryData.total_revenue ?? 0
      ),
      average_item_price: Number(
        summaryData.average_item_price ?? 0
      ),
    })


    const statesData =
      statesResponse.data?.states

    setStates(
      Array.isArray(statesData)
        ? statesData.map((item) => ({
            state: String(
              item.state ?? ""
            ),
            total_orders: Number(
              item.total_orders ?? 0
            ),
            total_revenue: Number(
              item.total_revenue ?? 0
            ),
          }))
        : []
    )


    const categoriesData =
      categoriesResponse.data?.categories

    setCategories(
      Array.isArray(categoriesData)
        ? categoriesData.map(
            (item) => ({
              category: String(
                item.category ?? ""
              ),
              items_sold: Number(
                item.items_sold ?? 0
              ),
              total_revenue: Number(
                item.total_revenue ?? 0
              ),
            })
          )
        : []
    )


    const trendData =
      trendResponse.data?.trend

    setTrend(
      Array.isArray(trendData)
        ? trendData.map((item) => ({
            date: String(
              item.date ?? ""
            ),
            total_orders: Number(
              item.total_orders ?? 0
            ),
            total_items: Number(
              item.total_items ?? 0
            ),
            total_revenue: Number(
              item.total_revenue ?? 0
            ),
          }))
        : []
    )


    setApiOnline(true)
  }


  const initializeDashboard =
    async () => {
      const loadingStartTime =
        Date.now()

      const minimumLoadingTime =
        4000

      try {
        setLoading(true)
        setError("")

        await axios.get(
          `${API_BASE_URL}/health`
        )

        const filterData =
          await loadFilters()

        const params =
          new URLSearchParams()

        const minDate =
          filterData.date_range?.min
            ? String(
                filterData
                  .date_range.min
              ).slice(0, 10)
            : ""

        const maxDate =
          filterData.date_range?.max
            ? String(
                filterData
                  .date_range.max
              ).slice(0, 10)
            : ""

        if (minDate) {
          params.set(
            "start_date",
            minDate
          )
        }

        if (maxDate) {
          params.set(
            "end_date",
            maxDate
          )
        }

        params.set(
          "order_status",
          "delivered"
        )

        await loadDashboard(params)

      } catch (err) {
        console.error(err)

        setApiOnline(false)

        setError(
          "Unable to connect to the DataPulse API. Make sure FastAPI is running on port 8000."
        )

      } finally {
        const elapsed =
          Date.now() -
          loadingStartTime

        const remainingTime =
          minimumLoadingTime -
          elapsed

        if (remainingTime > 0) {
          await new Promise(
            (resolve) =>
              setTimeout(
                resolve,
                remainingTime
              )
          )
        }

        setLoading(false)
      }
    }


  useEffect(() => {
    initializeDashboard()
  }, [])


  const handleApplyFilters =
    async () => {
      try {
        setRefreshing(true)
        setError("")

        await loadDashboard()

      } catch (err) {
        console.error(err)

        setError(
          "Unable to load analytics for the selected filters."
        )

        setApiOnline(false)

      } finally {
        setRefreshing(false)
      }
    }


  const handleRefresh =
    async () => {
      try {
        setRefreshing(true)
        setError("")

        await loadDashboard()

      } catch (err) {
        console.error(err)

        setError(
          "Refresh failed. Please check the API connection."
        )

        setApiOnline(false)

      } finally {
        setRefreshing(false)
      }
    }


  const clearFilters =
    async () => {
      if (!filters) return

      const minDate =
        filters.date_range?.min
          ? String(
              filters.date_range.min
            ).slice(0, 10)
          : ""

      const maxDate =
        filters.date_range?.max
          ? String(
              filters.date_range.max
            ).slice(0, 10)
          : ""

      setStartDate(minDate)
      setEndDate(maxDate)
      setSelectedState("")
      setSelectedCategory("")
      setSelectedStatus(
        "delivered"
      )
      setSearch("")

      try {
        setRefreshing(true)
        setError("")

        const params =
          new URLSearchParams()

        if (minDate) {
          params.set(
            "start_date",
            minDate
          )
        }

        if (maxDate) {
          params.set(
            "end_date",
            maxDate
          )
        }

        params.set(
          "order_status",
          "delivered"
        )

        await loadDashboard(
          params
        )

      } catch (err) {
        console.error(err)

        setError(
          "Unable to reset dashboard filters."
        )

      } finally {
        setRefreshing(false)
      }
    }


  const exportCSV = () => {
    let headers: string[] = []
    let rows: string[][] = []

    if (activeTab === "states") {
      headers = [
        "State",
        "Orders",
        "Revenue",
      ]

      rows = states.map(
        (item) => [
          item.state,
          String(
            item.total_orders
          ),
          item.total_revenue.toFixed(
            2
          ),
        ]
      )
    }


    if (activeTab === "categories") {
      headers = [
        "Category",
        "Items Sold",
        "Revenue",
      ]

      rows = categories.map(
        (item) => [
          formatCategoryName(
            item.category
          ),
          String(
            item.items_sold
          ),
          item.total_revenue.toFixed(
            2
          ),
        ]
      )
    }


    if (activeTab === "trends") {
      headers = [
        "Date",
        "Orders",
        "Items",
        "Revenue",
      ]

      rows = trend.map(
        (item) => [
          item.date,
          String(
            item.total_orders
          ),
          String(
            item.total_items
          ),
          item.total_revenue.toFixed(
            2
          ),
        ]
      )
    }


    if (activeTab === "overview") {
      headers = [
        "Metric",
        "Value",
      ]

      rows = [
        [
          "Total Orders",
          String(
            summary.total_orders
          ),
        ],
        [
          "Total Items",
          String(
            summary.total_items
          ),
        ],
        [
          "Total Revenue",
          summary.total_revenue.toFixed(
            2
          ),
        ],
        [
          "Average Order Value",
          averageOrderValue.toFixed(
            2
          ),
        ],
      ]
    }


    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        row
          .map(
            (value) =>
              `"${value.replace(
                /"/g,
                '""'
              )}"`
          )
          .join(",")
      ),
    ].join("\n")


    const blob = new Blob(
      [csv],
      {
        type:
          "text/csv;charset=utf-8;",
      }
    )


    const url =
      URL.createObjectURL(
        blob
      )

    const link =
      document.createElement(
        "a"
      )

    link.href = url

    link.download =
      `datapulse-${activeTab}-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`

    document.body.appendChild(
      link
    )

    link.click()

    document.body.removeChild(
      link
    )

    URL.revokeObjectURL(
      url
    )
  }


  const displayedStates =
    useMemo(() => {
      return states.slice(
        0,
        Number(stateLimit)
      )
    }, [
      states,
      stateLimit,
    ])


  const displayedCategories =
    useMemo(() => {
      return categories.slice(
        0,
        Number(
          categoryLimit
        )
      )
    }, [
      categories,
      categoryLimit,
    ])


  const maxStateRevenue =
    useMemo(() => {
      return Math.max(
        ...states.map(
          (item) =>
            Number(
              item.total_revenue
            )
        ),
        1
      )
    }, [states])


  const maxCategoryRevenue =
    useMemo(() => {
      return Math.max(
        ...categories.map(
          (item) =>
            Number(
              item.total_revenue
            )
        ),
        1
      )
    }, [categories])


  const totalStateRevenue =
    useMemo(() => {
      return states.reduce(
        (total, item) =>
          total +
          Number(
            item.total_revenue
          ),
        0
      )
    }, [states])


  const totalCategoryRevenue =
    useMemo(() => {
      return categories.reduce(
        (total, item) =>
          total +
          Number(
            item.total_revenue
          ),
        0
      )
    }, [categories])


  const topStatesChart =
    useMemo(() => {
      return states
        .slice(0, 10)
        .map((item) => ({
          state:
            item.state,
          revenue:
            Number(
              item.total_revenue
            ),
        }))
    }, [states])


  if (loading) {
    return (
      <div className="loading-screen">

        <div className="loading-grid" />

        <div className="loading-glow loading-glow-one" />
        <div className="loading-glow loading-glow-two" />

        <div className="loading-content">

          <div className="loading-brand-mark">

            <div className="loading-brand-icon">
              <Activity
                size={30}
                strokeWidth={2.2}
              />
            </div>

            <div className="loading-brand-text">

              <div className="loading-brand-name">
                DataPulse
              </div>

              <div className="loading-brand-subtitle">
                DATA ENGINEERING PLATFORM
              </div>

            </div>

          </div>


          <div className="analysis-orb">

            <div className="orb-ring orb-ring-one" />
            <div className="orb-ring orb-ring-two" />
            <div className="orb-ring orb-ring-three" />

            <div className="orb-core">
              <BarChart3
                size={38}
                strokeWidth={1.8}
              />
            </div>

            <span className="orb-pulse" />

          </div>


          <div className="loading-title">
            Analyzing your data
          </div>


          <div className="loading-description">
            Processing Olist commerce analytics
            through the DataPulse pipeline
          </div>


          <div className="pipeline">

            <div className="pipeline-line">
              <div className="pipeline-line-progress" />
            </div>


            <div className="pipeline-step active">

              <div className="pipeline-icon">
                <Database size={16} />
              </div>

              <span>
                Ingestion
              </span>

            </div>


            <div className="pipeline-step active">

              <div className="pipeline-icon">
                <Zap size={16} />
              </div>

              <span>
                Transform
              </span>

            </div>


            <div className="pipeline-step active">

              <div className="pipeline-icon">
                <LineChartIcon
                  size={16}
                />
              </div>

              <span>
                Analysis
              </span>

            </div>


            <div className="pipeline-step">

              <div className="pipeline-icon">
                <CheckCircle2
                  size={16}
                />
              </div>

              <span>
                Ready
              </span>

            </div>

          </div>


          <div className="loading-progress">

            <div className="loading-progress-top">

              <span>
                ANALYTICS ENGINE
              </span>

              <span className="loading-percentage">
                LIVE
              </span>

            </div>

            <div className="loading-progress-track">
              <div className="loading-progress-bar" />
            </div>

          </div>


          <div className="loading-status-grid">

            <div className="loading-status-card">

              <div className="loading-status-indicator online" />

              <div>

                <span>
                  API
                </span>

                <strong>
                  FastAPI
                </strong>

              </div>

            </div>


            <div className="loading-status-card">

              <div className="loading-status-indicator online" />

              <div>

                <span>
                  DATABASE
                </span>

                <strong>
                  PostgreSQL
                </strong>

              </div>

            </div>


            <div className="loading-status-card">

              <div className="loading-status-indicator processing" />

              <div>

                <span>
                  PIPELINE
                </span>

                <strong>
                  Airflow
                </strong>

              </div>

            </div>

          </div>


          <div className="loading-footer">

            <span>
              OLIST BRAZILIAN E-COMMERCE
            </span>

            <span className="loading-footer-dot">
              •
            </span>

            <span>
              REAL-TIME ANALYTICS
            </span>

          </div>

        </div>

      </div>
    )
  }


  return (
    <div className="app-shell">

      <aside className="sidebar">

        <div className="brand">

          <div className="brand-logo">
            <Activity
              size={21}
            />
          </div>

          <div>

            <div className="brand-name">
              DataPulse
            </div>

            <div className="brand-subtitle">
              Analytics Platform
            </div>

          </div>

        </div>


        <div className="sidebar-section">

          <div className="sidebar-label">
            Workspace
          </div>


          <button
            className={`nav-button ${
              activeTab ===
              "overview"
                ? "active"
                : ""
            }`}
            onClick={() =>
              setActiveTab(
                "overview"
              )
            }
          >
            <LayoutDashboard
              size={18}
            />

            <span>
              Overview
            </span>

          </button>


          <button
            className={`nav-button ${
              activeTab ===
              "states"
                ? "active"
                : ""
            }`}
            onClick={() =>
              setActiveTab(
                "states"
              )
            }
          >
            <Globe2
              size={18}
            />

            <span>
              States
            </span>

          </button>


          <button
            className={`nav-button ${
              activeTab ===
              "categories"
                ? "active"
                : ""
            }`}
            onClick={() =>
              setActiveTab(
                "categories"
              )
            }
          >
            <Package
              size={18}
            />

            <span>
              Categories
            </span>

          </button>


          <button
            className={`nav-button ${
              activeTab ===
              "trends"
                ? "active"
                : ""
            }`}
            onClick={() =>
              setActiveTab(
                "trends"
              )
            }
          >
            <LineChartIcon
              size={18}
            />

            <span>
              Trends
            </span>

          </button>

        </div>


        <div className="sidebar-section">

          <div className="sidebar-label">
            Data
          </div>


          <div className="sidebar-info">

            <Database
              size={16}
            />

            <div>

              <strong>
                Olist
              </strong>

              <span>
                Brazilian E-Commerce
              </span>

            </div>

          </div>


          <div className="sidebar-info">

            <Server
              size={16}
            />

            <div>

              <strong>
                PostgreSQL
              </strong>

              <span>
                Data Warehouse
              </span>

            </div>

          </div>

        </div>


        <div className="sidebar-bottom">

          <div className="database-card">

            <div className="database-card-top">

              <div className="database-icon">
                <Database
                  size={17}
                />
              </div>


              <div
                className={`connection-status ${
                  apiOnline
                    ? "online"
                    : "offline"
                }`}
              >

                <span className="status-dot" />

                {apiOnline
                  ? "Online"
                  : "Offline"}

              </div>

            </div>


            <strong>
              DataPulse API
            </strong>

            <span>
              PostgreSQL connected
            </span>

          </div>


          <div className="sidebar-footer">
            DataPulse v5.0
          </div>

        </div>

      </aside>


      <main className="main-content">

        <header className="topbar">

          <div>

            <div className="eyebrow">

              <span className="eyebrow-dot" />

              Live analytics

            </div>


            <h1>

              {activeTab ===
                "overview" &&
                "Analytics Overview"}

              {activeTab ===
                "states" &&
                "State Performance"}

              {activeTab ===
                "categories" &&
                "Category Performance"}

              {activeTab ===
                "trends" &&
                "Sales Trends"}

            </h1>


            <p>
              Monitor your Olist
              e-commerce dataset
              and business performance.
            </p>

          </div>


          <div className="topbar-actions">

            <div className="api-status">

              <span
                className={`status-dot ${
                  apiOnline
                    ? "online-dot"
                    : "offline-dot"
                }`}
              />

              {apiOnline
                ? "API Connected"
                : "API Offline"}

            </div>


            <button
              className="secondary-button"
              onClick={
                handleRefresh
              }
              disabled={
                refreshing
              }
            >

              <RefreshCw
                size={16}
                className={
                  refreshing
                    ? "spin"
                    : ""
                }
              />

              Refresh

            </button>


            <button
              className="primary-button"
              onClick={
                exportCSV
              }
            >

              <Download
                size={16}
              />

              Export

            </button>

          </div>

        </header>


        {error && (
          <div className="error-banner">

            <AlertCircle
              size={19}
            />

            <div>

              <strong>
                Data connection issue
              </strong>

              <span>
                {error}
              </span>

            </div>


            <button
              onClick={() =>
                setError("")
              }
            >
              <X size={17} />
            </button>

          </div>
        )}


        <section className="filter-panel">

          <div className="section-heading">

            <div className="section-heading-left">

              <div className="heading-icon">
                <SlidersHorizontal
                  size={18}
                />
              </div>

              <div>

                <h2>
                  Analytics filters
                </h2>

                <p>
                  Refine the dataset in real time
                </p>

              </div>

            </div>


            {activeFilterCount >
              0 && (
              <div className="filter-count">
                {
                  activeFilterCount
                }{" "}
                active
              </div>
            )}

          </div>


          <div className="filter-grid">

            <div className="input-wrapper">

              <label>
                Search
              </label>

              <div className="input-with-icon">

                <Search
                  size={16}
                />

                <input
                  type="text"
                  placeholder="Search state or category..."
                  value={search}
                  onChange={(
                    event
                  ) =>
                    setSearch(
                      event
                        .target
                        .value
                    )
                  }
                  onKeyDown={(
                    event
                  ) => {
                    if (
                      event.key ===
                      "Enter"
                    ) {
                      handleApplyFilters()
                    }
                  }}
                />


                {search && (
                  <button
                    className="input-clear"
                    onClick={() =>
                      setSearch("")
                    }
                  >
                    <X size={14} />
                  </button>
                )}

              </div>

            </div>


            <div className="input-wrapper">

              <label>
                State
              </label>

              <div className="select-wrapper">

                <select
                  value={
                    selectedState
                  }
                  onChange={(
                    event
                  ) =>
                    setSelectedState(
                      event
                        .target
                        .value
                    )
                  }
                >

                  <option value="">
                    All states
                  </option>

                  {filters?.states?.map(
                    (state) => (
                      <option
                        key={state}
                        value={state}
                      >
                        {state}
                      </option>
                    )
                  )}

                </select>

                <ChevronDown
                  size={16}
                />

              </div>

            </div>


            <div className="input-wrapper">

              <label>
                Category
              </label>

              <div className="select-wrapper">

                <select
                  value={
                    selectedCategory
                  }
                  onChange={(
                    event
                  ) =>
                    setSelectedCategory(
                      event
                        .target
                        .value
                    )
                  }
                >

                  <option value="">
                    All categories
                  </option>

                  <option value="unknown">
                    Unknown
                  </option>

                  {filters?.categories?.map(
                    (category) => (
                      <option
                        key={category}
                        value={category}
                      >
                        {formatCategoryName(
                          category
                        )}
                      </option>
                    )
                  )}

                </select>

                <ChevronDown
                  size={16}
                />

              </div>

            </div>


            <div className="input-wrapper">

              <label>
                Status
              </label>

              <div className="select-wrapper">

                <select
                  value={
                    selectedStatus
                  }
                  onChange={(
                    event
                  ) =>
                    setSelectedStatus(
                      event
                        .target
                        .value
                    )
                  }
                >

                  <option value="delivered">
                    Delivered
                  </option>

                  <option value="all">
                    All statuses
                  </option>

                  {filters?.statuses
                    ?.filter(
                      (
                        status
                      ) =>
                        status !==
                        "delivered"
                    )
                    .map(
                      (
                        status
                      ) => (
                        <option
                          key={
                            status
                          }
                          value={
                            status
                          }
                        >
                          {
                            formatCategoryName(
                              status
                            )
                          }
                        </option>
                      )
                    )}

                </select>

                <ChevronDown
                  size={16}
                />

              </div>

            </div>


            <div className="date-field">

              <label>
                From
              </label>

              <input
                type="date"
                value={
                  startDate
                }
                min={getInitialDate(
                  filters
                    ?.date_range
                    ?.min ??
                    null
                )}
                max={
                  endDate ||
                  undefined
                }
                onChange={(
                  event
                ) =>
                  setStartDate(
                    event
                      .target
                      .value
                  )
                }
              />

            </div>


            <div className="date-field">

              <label>
                To
              </label>

              <input
                type="date"
                value={
                  endDate
                }
                min={
                  startDate ||
                  undefined
                }
                max={getInitialDate(
                  filters
                    ?.date_range
                    ?.max ??
                    null
                )}
                onChange={(
                  event
                ) =>
                  setEndDate(
                    event
                      .target
                      .value
                  )
                }
              />

            </div>


            <div className="filter-actions">

              <button
                className="primary-button filter-apply"
                onClick={
                  handleApplyFilters
                }
                disabled={
                  refreshing
                }
              >

                <Filter
                  size={16}
                />

                Apply filters

              </button>


              <button
                className="clear-button"
                onClick={
                  clearFilters
                }
              >
                Clear
              </button>

            </div>

          </div>

        </section>


        <section className="kpi-grid">

          <div className="kpi-card">

            <div className="kpi-top">

              <div className="kpi-icon blue">
                <ShoppingCart
                  size={19}
                />
              </div>

              <span className="live-label">
                Live
              </span>

            </div>

            <div className="kpi-label">
              Total orders
            </div>

            <div className="kpi-value">
              {formatNumber(
                summary.total_orders
              )}
            </div>

            <div className="kpi-description">
              Orders matching filters
            </div>

          </div>


          <div className="kpi-card">

            <div className="kpi-top">

              <div className="kpi-icon purple">
                <Package
                  size={19}
                />
              </div>

              <span className="live-label">
                Live
              </span>

            </div>

            <div className="kpi-label">
              Items sold
            </div>

            <div className="kpi-value">
              {formatNumber(
                summary.total_items
              )}
            </div>

            <div className="kpi-description">
              Total order line items
            </div>

          </div>


          <div className="kpi-card">

            <div className="kpi-top">

              <div className="kpi-icon green">
                <CircleDollarSign
                  size={19}
                />
              </div>

              <span className="live-label">
                Live
              </span>

            </div>

            <div className="kpi-label">
              Total revenue
            </div>

            <div className="kpi-value currency">
              {formatCompactCurrency(
                summary.total_revenue
              )}
            </div>

            <div className="kpi-description">
              Product revenue in BRL
            </div>

          </div>


          <div className="kpi-card">

            <div className="kpi-top">

              <div className="kpi-icon orange">
                <TrendingUp
                  size={19}
                />
              </div>

              <span className="live-label">
                Average
              </span>

            </div>

            <div className="kpi-label">
              Average order value
            </div>

            <div className="kpi-value currency">
              {formatCurrency(
                averageOrderValue
              )}
            </div>

            <div className="kpi-description">
              Average revenue per order
            </div>

          </div>

        </section>


        <div className="tabs">

          <button
            className={
              activeTab ===
              "overview"
                ? "tab active"
                : "tab"
            }
            onClick={() =>
              setActiveTab(
                "overview"
              )
            }
          >
            <LayoutDashboard
              size={16}
            />
            Overview
          </button>


          <button
            className={
              activeTab ===
              "states"
                ? "tab active"
                : "tab"
            }
            onClick={() =>
              setActiveTab(
                "states"
              )
            }
          >
            <Globe2
              size={16}
            />
            States
          </button>


          <button
            className={
              activeTab ===
              "categories"
                ? "tab active"
                : "tab"
            }
            onClick={() =>
              setActiveTab(
                "categories"
              )
            }
          >
            <Package
              size={16}
            />
            Categories
          </button>


          <button
            className={
              activeTab ===
              "trends"
                ? "tab active"
                : "tab"
            }
            onClick={() =>
              setActiveTab(
                "trends"
              )
            }
          >
            <BarChart3
              size={16}
            />
            Trends
          </button>

        </div>


        {activeTab ===
          "overview" && (
          <>

            <section className="dashboard-grid">

              <div className="chart-card large">

                <div className="chart-header">

                  <div>

                    <div className="chart-title">
                      Revenue trend
                    </div>

                    <div className="chart-subtitle">
                      Daily revenue across the selected period
                    </div>

                  </div>

                  <div className="chart-title-icon">
                    <LineChartIcon
                      size={18}
                    />
                  </div>

                </div>


                <div className="chart-container">

                  {trend.length >
                  0 ? (
                    <ResponsiveContainer
                      width="100%"
                      height="100%"
                    >

                      <LineChart
                        data={trend}
                        margin={{
                          top: 10,
                          right: 10,
                          left: 5,
                          bottom: 5,
                        }}
                      >

                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#edf0f3"
                        />


                        <XAxis
                          dataKey="date"
                          tickFormatter={(
                            value
                          ) =>
                            formatDate(
                              String(
                                value
                              )
                            )
                          }
                          tick={{
                            fill:
                              "#8a919b",
                            fontSize: 11,
                          }}
                          axisLine={
                            false
                          }
                          tickLine={
                            false
                          }
                          minTickGap={
                            30
                          }
                        />


                        <YAxis
                          tickFormatter={(
                            value
                          ) =>
                            formatCompactCurrency(
                              Number(
                                value
                              )
                            )
                          }
                          tick={{
                            fill:
                              "#8a919b",
                            fontSize: 11,
                          }}
                          axisLine={
                            false
                          }
                          tickLine={
                            false
                          }
                          width={75}
                        />


                        <Tooltip
                          contentStyle={{
                            border:
                              "1px solid #e7e9ed",
                            borderRadius: 10,
                            boxShadow:
                              "0 10px 30px rgba(0,0,0,0.08)",
                          }}
                          formatter={(
                            value
                          ) =>
                            formatCurrency(
                              Number(
                                value || 0
                              )
                            )
                          }
                          labelFormatter={(
                            label
                          ) =>
                            formatDate(
                              String(
                                label
                              )
                            )
                          }
                        />


                        <Line
                          type="monotone"
                          dataKey="total_revenue"
                          stroke="#e11d48"
                          strokeWidth={2.5}
                          dot={false}
                          activeDot={{
                            r: 5,
                          }}
                        />

                      </LineChart>

                    </ResponsiveContainer>
                  ) : (
                    <div className="empty-state">

                      <BarChart3
                        size={30}
                      />

                      <strong>
                        No trend data
                      </strong>

                      <span>
                        Try changing your filters.
                      </span>

                    </div>
                  )}

                </div>

              </div>


              <div className="chart-card">

                <div className="chart-header">

                  <div>

                    <div className="chart-title">
                      Revenue by state
                    </div>

                    <div className="chart-subtitle">
                      Top performing states
                    </div>

                  </div>

                  <div className="chart-title-icon">
                    <Globe2
                      size={18}
                    />
                  </div>

                </div>


                <div className="chart-container">

                  {topStatesChart.length >
                  0 ? (
                    <ResponsiveContainer
                      width="100%"
                      height="100%"
                    >

                      <BarChart
                        data={
                          topStatesChart
                        }
                        margin={{
                          top: 5,
                          right: 5,
                          left: -15,
                          bottom: 5,
                        }}
                      >

                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#edf0f3"
                          vertical={
                            false
                          }
                        />


                        <XAxis
                          dataKey="state"
                          tick={{
                            fill:
                              "#8a919b",
                            fontSize: 11,
                          }}
                          axisLine={
                            false
                          }
                          tickLine={
                            false
                          }
                        />


                        <YAxis
                          tickFormatter={(
                            value
                          ) =>
                            formatCompactCurrency(
                              Number(
                                value
                              )
                            )
                          }
                          tick={{
                            fill:
                              "#8a919b",
                            fontSize: 10,
                          }}
                          axisLine={
                            false
                          }
                          tickLine={
                            false
                          }
                          width={65}
                        />


                        <Tooltip
                          contentStyle={{
                            border:
                              "1px solid #e7e9ed",
                            borderRadius: 10,
                          }}
                          formatter={(
                            value
                          ) =>
                            formatCurrency(
                              Number(
                                value || 0
                              )
                            )
                          }
                        />


                        <Bar
                          dataKey="revenue"
                          fill="#e11d48"
                          radius={[
                            5,
                            5,
                            0,
                            0,
                          ]}
                        />

                      </BarChart>

                    </ResponsiveContainer>
                  ) : (
                    <div className="empty-state">

                      <Globe2
                        size={30}
                      />

                      <strong>
                        No state data
                      </strong>

                    </div>
                  )}

                </div>

              </div>

            </section>


            <section className="dashboard-grid">

              <div className="chart-card">

                <div className="chart-header">

                  <div>

                    <div className="chart-title">
                      Category mix
                    </div>

                    <div className="chart-subtitle">
                      Revenue distribution
                    </div>

                  </div>

                  <div className="chart-title-icon">
                    <Package
                      size={18}
                    />
                  </div>

                </div>


                <div className="chart-container pie-container">

                  {categories.length >
                  0 ? (
                    <ResponsiveContainer
                      width="100%"
                      height="100%"
                    >

                      <PieChart>

                        <Pie
                          data={
                            categories.slice(
                              0,
                              8
                            )
                          }
                          dataKey="total_revenue"
                          nameKey="category"
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={95}
                          paddingAngle={3}
                        >

                          {categories
                            .slice(
                              0,
                              8
                            )
                            .map(
                              (
                                _,
                                index
                              ) => (
                                <Cell
                                  key={
                                    index
                                  }
                                  fill={
                                    [
                                      "#e11d48",
                                      "#f43f5e",
                                      "#fb7185",
                                      "#fda4af",
                                      "#be123c",
                                      "#9f1239",
                                      "#881337",
                                      "#4c0519",
                                    ][
                                      index
                                    ]
                                  }
                                />
                              )
                            )}

                        </Pie>


                        <Tooltip
                          formatter={(
                            value
                          ) =>
                            formatCurrency(
                              Number(
                                value ||
                                  0
                              )
                            )
                          }
                        />

                      </PieChart>

                    </ResponsiveContainer>
                  ) : (
                    <div className="empty-state">

                      <Package
                        size={30}
                      />

                      <strong>
                        No category data
                      </strong>

                    </div>
                  )}

                </div>

              </div>


              <div className="chart-card">

                <div className="chart-header">

                  <div>

                    <div className="chart-title">
                      Top categories
                    </div>

                    <div className="chart-subtitle">
                      Revenue by product category
                    </div>

                  </div>

                  <div className="chart-title-icon">
                    <BarChart3
                      size={18}
                    />
                  </div>

                </div>


                <div className="mini-category-list">

                  {categories
                    .slice(0, 6)
                    .map(
                      (
                        item,
                        index
                      ) => {

                        const percentage =
                          totalCategoryRevenue >
                          0
                            ? (
                                (Number(
                                  item.total_revenue
                                ) /
                                  totalCategoryRevenue) *
                                100
                              )
                            : 0

                        return (
                          <div
                            className="mini-category"
                            key={
                              item.category
                            }
                          >

                            <div className="mini-category-top">

                              <div className="mini-category-name">

                                <span>
                                  {
                                    index +
                                    1
                                  }
                                </span>

                                <strong>
                                  {formatCategoryName(
                                    item.category
                                  )}
                                </strong>

                              </div>


                              <strong>
                                {formatCompactCurrency(
                                  item.total_revenue
                                )}
                              </strong>

                            </div>


                            <div className="progress">

                              <div
                                style={{
                                  width: `${Math.min(
                                    percentage,
                                    100
                                  )}%`,
                                }}
                              />

                            </div>

                          </div>
                        )
                      }
                    )}

                </div>

              </div>

            </section>

          </>
        )}


        {activeTab ===
          "states" && (
          <section className="data-section">

            <div className="section-toolbar">

              <div>

                <h2>
                  State performance
                </h2>

                <p>
                  Revenue and order performance across Brazilian states.
                </p>

              </div>


              <div className="toolbar-actions">

                <div className="limit-select">

                  <span>
                    Show
                  </span>

                  <select
                    value={
                      stateLimit
                    }
                    onChange={(
                      event
                    ) =>
                      setStateLimit(
                        event.target.value
                      )
                    }
                  >

                    <option value="5">
                      5
                    </option>

                    <option value="10">
                      10
                    </option>

                    <option value="15">
                      15
                    </option>

                    <option value="27">
                      All
                    </option>

                  </select>

                </div>


                <button
                  className="secondary-button"
                  onClick={
                    exportCSV
                  }
                >
                  <Download
                    size={15}
                  />

                  CSV
                </button>

              </div>

            </div>


            <div className="table-container">

              <table>

                <thead>

                  <tr>

                    <th>
                      State
                    </th>

                    <th>
                      Orders
                    </th>

                    <th>
                      Revenue
                    </th>

                    <th>
                      Share
                    </th>

                    <th>
                      Distribution
                    </th>

                  </tr>

                </thead>


                <tbody>

                  {displayedStates.map(
                    (
                      item,
                      index
                    ) => {

                      const share =
                        totalStateRevenue >
                        0
                          ? (
                              (Number(
                                item.total_revenue
                              ) /
                                totalStateRevenue) *
                              100
                            )
                          : 0

                      const progress =
                        maxStateRevenue >
                        0
                          ? (
                              Number(
                                item.total_revenue
                              ) /
                                maxStateRevenue
                            ) *
                            100
                          : 0

                      return (
                        <tr
                          key={
                            item.state
                          }
                        >

                          <td>

                            <div className="state-name">

                              <span className="rank">
                                {
                                  index +
                                  1
                                }
                              </span>

                              <span className="state-dot" />

                              <strong>
                                {
                                  item.state
                                }
                              </strong>

                            </div>

                          </td>


                          <td>
                            {formatNumber(
                              item.total_orders
                            )}
                          </td>


                          <td className="revenue-cell">
                            {formatCurrency(
                              item.total_revenue
                            )}
                          </td>


                          <td className="share-cell">
                            {share.toFixed(
                              1
                            )}
                            %
                          </td>


                          <td>

                            <div className="table-progress">

                              <div
                                style={{
                                  width: `${progress}%`,
                                }}
                              />

                            </div>

                          </td>

                        </tr>
                      )
                    }
                  )}

                </tbody>

              </table>


              {displayedStates.length ===
                0 && (
                <div className="empty-table">

                  <Database
                    size={34}
                  />

                  <strong>
                    No state data found
                  </strong>

                  <span>
                    Try adjusting your filters.
                  </span>

                </div>
              )}

            </div>

          </section>
        )}


        {activeTab ===
          "categories" && (
          <section className="data-section">

            <div className="section-toolbar">

              <div>

                <h2>
                  Product categories
                </h2>

                <p>
                  Revenue and volume by category.
                </p>

              </div>


              <div className="toolbar-actions">

                <div className="limit-select">

                  <span>
                    Show
                  </span>

                  <select
                    value={
                      categoryLimit
                    }
                    onChange={(
                      event
                    ) =>
                      setCategoryLimit(
                        event.target.value
                      )
                    }
                  >

                    <option value="5">
                      5
                    </option>

                    <option value="10">
                      10
                    </option>

                    <option value="15">
                      15
                    </option>

                    <option value="20">
                      20
                    </option>

                  </select>

                </div>


                <button
                  className="secondary-button"
                  onClick={
                    exportCSV
                  }
                >

                  <Download
                    size={15}
                  />

                  CSV

                </button>

              </div>

            </div>


            <div className="category-grid">

              {displayedCategories.map(
                (
                  item,
                  index
                ) => {

                  const progress =
                    maxCategoryRevenue >
                    0
                      ? (
                          Number(
                            item.total_revenue
                          ) /
                            maxCategoryRevenue
                        ) *
                        100
                      : 0

                  return (
                    <div
                      className="category-card"
                      key={
                        item.category
                      }
                    >

                      <div className="category-top">

                        <div className="category-icon">
                          <Package
                            size={18}
                          />
                        </div>

                        <span className="category-rank">
                          #
                          {
                            index +
                            1
                          }
                        </span>

                      </div>


                      <div className="category-name">
                        {formatCategoryName(
                          item.category
                        )}
                      </div>


                      <div className="category-revenue">
                        {formatCurrency(
                          item.total_revenue
                        )}
                      </div>


                      <div className="category-meta">

                        <span>
                          {formatNumber(
                            item.items_sold
                          )}{" "}
                          items
                        </span>


                        <span>
                          {formatCurrency(
                            item.items_sold >
                              0
                              ? Number(
                                  item.total_revenue
                                ) /
                                  Number(
                                    item.items_sold
                                  )
                              : 0
                          )}{" "}
                          avg.
                        </span>

                      </div>


                      <div className="category-progress">

                        <div
                          style={{
                            width: `${progress}%`,
                          }}
                        />

                      </div>

                    </div>
                  )
                }
              )}

            </div>


            {displayedCategories.length ===
              0 && (
              <div className="empty-table">

                <Package
                  size={34}
                />

                <strong>
                  No category data found
                </strong>

                <span>
                  Try adjusting your filters.
                </span>

              </div>
            )}

          </section>
        )}


        {activeTab ===
          "trends" && (
          <section className="data-section">

            <div className="section-toolbar">

              <div>

                <h2>
                  Daily sales trend
                </h2>

                <p>
                  Daily orders, items and revenue across the selected period.
                </p>

              </div>


              <button
                className="secondary-button"
                onClick={
                  exportCSV
                }
              >

                <Download
                  size={15}
                />

                Export CSV

              </button>

            </div>


            <div className="chart-card trend-full">

              <div className="chart-container trend-chart">

                {trend.length >
                0 ? (
                  <ResponsiveContainer
                    width="100%"
                    height="100%"
                  >

                    <LineChart
                      data={trend}
                      margin={{
                        top: 10,
                        right: 20,
                        left: 5,
                        bottom: 5,
                      }}
                    >

                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#edf0f3"
                      />


                      <XAxis
                        dataKey="date"
                        tickFormatter={(
                          value
                        ) =>
                          formatDate(
                            String(
                              value
                            )
                          )
                        }
                        tick={{
                          fill:
                            "#8a919b",
                          fontSize: 11,
                        }}
                        axisLine={
                          false
                        }
                        tickLine={
                          false
                        }
                        minTickGap={
                          30
                        }
                      />


                      <YAxis
                        tickFormatter={(
                          value
                        ) =>
                          formatCompactCurrency(
                            Number(
                              value
                            )
                          )
                        }
                        tick={{
                          fill:
                            "#8a919b",
                          fontSize: 11,
                        }}
                        axisLine={
                          false
                        }
                        tickLine={
                          false
                        }
                        width={75}
                      />


                      <Tooltip
                        contentStyle={{
                          border:
                            "1px solid #e7e9ed",
                          borderRadius: 10,
                          boxShadow:
                            "0 10px 30px rgba(0,0,0,0.08)",
                        }}
                        formatter={(
                          value
                        ) =>
                          formatCurrency(
                            Number(
                              value ||
                                0
                            )
                          )
                        }
                        labelFormatter={(
                          label
                        ) =>
                          formatDate(
                            String(
                              label
                            )
                          )
                        }
                      />


                      <Line
                        type="monotone"
                        dataKey="total_revenue"
                        stroke="#e11d48"
                        strokeWidth={
                          2.5
                        }
                        dot={false}
                        activeDot={{
                          r: 5,
                        }}
                      />

                    </LineChart>

                  </ResponsiveContainer>
                ) : (
                  <div className="empty-state">

                    <LineChartIcon
                      size={32}
                    />

                    <strong>
                      No trend data
                    </strong>

                    <span>
                      Change your filters and try again.
                    </span>

                  </div>
                )}

              </div>

            </div>


            <div className="table-container trend-table">

              <table>

                <thead>

                  <tr>

                    <th>
                      Date
                    </th>

                    <th>
                      Orders
                    </th>

                    <th>
                      Items
                    </th>

                    <th>
                      Revenue
                    </th>

                  </tr>

                </thead>


                <tbody>

                  {trend
                    .slice(-30)
                    .reverse()
                    .map(
                      (item) => (
                        <tr
                          key={
                            item.date
                          }
                        >

                          <td>
                            <strong>
                              {formatDate(
                                item.date
                              )}
                            </strong>
                          </td>


                          <td>
                            {formatNumber(
                              item.total_orders
                            )}
                          </td>


                          <td>
                            {formatNumber(
                              item.total_items
                            )}
                          </td>


                          <td className="revenue-cell">
                            {formatCurrency(
                              item.total_revenue
                            )}
                          </td>

                        </tr>
                      )
                    )}

                </tbody>

              </table>

            </div>

          </section>
        )}


        <footer className="footer">

          <div>

            <span className="footer-dot" />

            DataPulse Analytics

          </div>


          <span>
            Olist Brazilian E-Commerce Dataset
          </span>


          <span>
            PostgreSQL • Airflow • FastAPI • React
          </span>

        </footer>

      </main>

    </div>
  )
}


export default App