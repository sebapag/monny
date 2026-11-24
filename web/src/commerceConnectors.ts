/** Catalog of commerce platforms shown in Admin → Connettori commerce. */

export type CommerceConnectorStatus = 'included' | 'coming_soon'

export type CommerceConnectorDef = {
  id: string
  name: string
  status: CommerceConnectorStatus
  /** Short Italian blurb under the logo. */
  blurb: string
  /** Brand mark color when included; ignored when coming_soon (UI greys it). */
  brand: string
  /** Simple SVG path(s) for a recognizable mark (viewBox 0 0 48 48). */
  mark: string
}

/**
 * Shopify is the only connectable commerce adapter in v1.
 * Other platforms stay UI-only «Prossimamente» — no Magento/Salesforce adapters.
 */
export const COMMERCE_CONNECTORS: readonly CommerceConnectorDef[] = [
  {
    id: 'shopify',
    name: 'Shopify',
    status: 'included',
    blurb: 'OAuth Partner app: dominio + access token portable.',
    brand: '#96bf48',
    mark: 'M12 8h24l2 32H10L12 8zm6 6v18m6-18v18m6-18v18',
  },
  {
    id: 'woocommerce',
    name: 'WooCommerce',
    status: 'coming_soon',
    blurb: 'WordPress / WooCommerce.',
    brand: '#96588a',
    mark: 'M24 8c-8 0-14 6-14 16s6 16 14 16 14-6 14-16-6-16-14-16zm-6 12h12M18 28h8',
  },
  {
    id: 'magento',
    name: 'Magento',
    status: 'coming_soon',
    blurb: 'Adobe Commerce / Magento.',
    brand: '#f26322',
    mark: 'M8 36V14l16-6 16 6v22L24 42 8 36z',
  },
  {
    id: 'salesforce_commerce',
    name: 'Salesforce Commerce',
    status: 'coming_soon',
    blurb: 'SFCC / Commerce Cloud.',
    brand: '#00a1e0',
    mark: 'M16 28c0-6 4-10 10-10s8 2 10 6c4 0 8 3 8 8s-4 8-9 8H18c-5 0-8-3-8-8 0-4 3-7 6-8z',
  },
  {
    id: 'prestashop',
    name: 'PrestaShop',
    status: 'coming_soon',
    blurb: 'PrestaShop storefront.',
    brand: '#df0067',
    mark: 'M10 34V16l14-8 14 8v18H10zm8-4h12',
  },
  {
    id: 'bigcommerce',
    name: 'BigCommerce',
    status: 'coming_soon',
    blurb: 'BigCommerce SaaS.',
    brand: '#121118',
    mark: 'M12 12h24v8H12zm0 12h16v12H12z',
  },
] as const

export function connectorById(id: string): CommerceConnectorDef | undefined {
  return COMMERCE_CONNECTORS.find((c) => c.id === id)
}

export function isShopifyConnected(shopify: {
  shop_domain?: string
  connected?: boolean
}): boolean {
  return Boolean(shopify?.connected && (shopify.shop_domain || '').trim())
}
