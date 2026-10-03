export class MarketMediaError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function marketMediaFields(body: any, actor: any, store: any) {
  const uploaded = (url: unknown) => {
    if (typeof url !== 'string' || !(store.marketMedia || []).some((m: any) =>
      m.imageUrl === url && (m.accountId === actor.id || actor.role === 'admin'))) {
      throw new MarketMediaError('Choose a photograph uploaded by your seller account.');
    }
    return url;
  };
  const result: any = {};
  if (body.additionalImages !== undefined) {
    if (!Array.isArray(body.additionalImages) || body.additionalImages.length > 3) throw new MarketMediaError('Items support up to three extra photographs.');
    result.additionalImages = body.additionalImages.map(uploaded);
    if (new Set(result.additionalImages).size !== result.additionalImages.length) throw new MarketMediaError('Choose distinct extra photographs.');
  }
  if (body.priceCategories !== undefined) {
    if (!Array.isArray(body.priceCategories) || body.priceCategories.length > 4) throw new MarketMediaError('Services support up to four price options.');
    result.priceCategories = body.priceCategories.map((c: any) => {
      if (!c || typeof c !== 'object' || typeof c.id !== 'string' || !c.id.trim() || c.id.length > 100 ||
          typeof c.name !== 'string' || !c.name.trim() || c.name.length > 150 ||
          typeof c.price !== 'number' || !Number.isFinite(c.price) || c.price < 0 || c.price > 10000000 ||
          c.description !== undefined && (typeof c.description !== 'string' || c.description.length > 1000)) throw new MarketMediaError('Each price option requires an ID, name and finite non-negative price.');
      return { id: c.id, name: c.name.trim(), price: c.price,
        ...(c.description ? { description: c.description.trim() } : {}),
        ...(c.imageUrl ? { imageUrl: uploaded(c.imageUrl) } : {}) };
    });
    if (new Set(result.priceCategories.map((c: any) => c.id)).size !== result.priceCategories.length ||
        new Set(result.priceCategories.map((c: any) => c.name.toLowerCase())).size !== result.priceCategories.length) throw new MarketMediaError('Price option IDs and names must be unique.');
  }
  return result;
}
