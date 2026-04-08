import { NextResponse } from 'next/server';

export async function GET() {
  const token = process.env.SHOPIFY_ADMIN_TOKEN;
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  // Shopify GraphQL expects a GID format in a 
  const collectionId = `gid://shopify/Collection/${process.env.COLLECTION_ID}`;

  const query = `
    query getInventory($id: ID!) {
      collection(id: $id) {
        products(first: 250) {
          edges {
            node {
              id
              totalInventory
            }
          }
        }
      }
    }
  `;

  try {
    // 1. Fetch current stock levels
    const res = await fetch(`https://${domain}/admin/api/2026-01/graphql.json`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'X-Shopify-Access-Token': token! 
      },
      body: JSON.stringify({ query, variables: { id: collectionId } }),
    });

    const { data } = await res.json();
    const products = data.collection.products.edges.map((e: any) => e.node);

    // 2. Sorting Logic: In-stock first, then by quantity. Out-of-stock last.
    const sorted = [...products].sort((a, b) => {
      if (a.totalInventory > 0 && b.totalInventory <= 0) return -1;
      if (a.totalInventory <= 0 && b.totalInventory > 0) return 1;
      return b.totalInventory - a.totalInventory;
    });

    // 3. Prepare Move Inputs
    const moves = sorted.map((p, index) => ({
      id: p.id,
      newPosition: String(index)
    }));

    // 4. Send the reorder mutation
    const reorderMutation = `
      mutation reorder($id: ID!, $moves: [MoveInput!]!) {
        collectionReorderProducts(id: $id, moves: $moves) {
          job { id }
          userErrors { message }
        }
      }
    `;

    await fetch(`https://${domain}/admin/api/2026-01/graphql.json`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'X-Shopify-Access-Token': token! 
      },
      body: JSON.stringify({ 
        query: reorderMutation, 
        variables: { id: collectionId, moves } 
      }),
    });

    return NextResponse.json({ success: true, message: "Inventory re-sorted!" });

  } catch (error) {
    return NextResponse.json({ success: false, error: "Failed to sort" }, { status: 500 });
  }
}