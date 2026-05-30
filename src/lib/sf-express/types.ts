export type SfRouteNode = {
  acceptTime: string
  acceptAddress?: string
  remark: string
  opCode?: string
}

export type SfCreateOrderResult = {
  orderId: string
  waybillNo: string
  filterResult?: string
  destCode?: string
  raw?: unknown
}

export type SfRouteQueryResult = {
  mailNo: string
  routes: SfRouteNode[]
  raw?: unknown
}

export type SfOrderMetadata = {
  sf_waybill_no?: string
  sf_order_id?: string
  sf_status?: string
  sf_routes?: SfRouteNode[]
  sf_last_route_at?: string
  sf_label_url?: string
  sf_created_at?: string
}
