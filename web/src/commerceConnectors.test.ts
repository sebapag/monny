import { describe, expect, it } from 'vitest'
import {
  COMMERCE_CONNECTORS,
  connectorById,
  isShopifyConnected,
} from './commerceConnectors'

describe('commerceConnectors', () => {
  it('lists Shopify as the only included connector', () => {
    const included = COMMERCE_CONNECTORS.filter((c) => c.status === 'included')
    expect(included).toHaveLength(1)
    expect(included[0]?.id).toBe('shopify')
  })

  it('greys Magento / Salesforce / WooCommerce as coming soon', () => {
    for (const id of ['magento', 'salesforce_commerce', 'woocommerce', 'prestashop', 'bigcommerce']) {
      expect(connectorById(id)?.status).toBe('coming_soon')
    }
  })

  it('treats Shopify as connected only with domain + connected flag', () => {
    expect(isShopifyConnected({ shop_domain: '', connected: true })).toBe(false)
    expect(isShopifyConnected({ shop_domain: 'demo-shop.myshopify.com', connected: false })).toBe(
      false,
    )
    expect(isShopifyConnected({ shop_domain: 'demo-shop.myshopify.com', connected: true })).toBe(
      true,
    )
  })
})
