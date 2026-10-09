import type { Express, RequestHandler } from 'express';
import { ApiError, SupabaseDatabase, uuid } from './db.js';
import { MARKET_DEFAULT_COVERS, MARKET_DEFAULT_LOGO } from '../marketBranding.js';
import { marketPlanBenefits } from '../marketPlans.js';

const route = (work: (req: any, res: any) => Promise<unknown>): RequestHandler => (req, res, next) => { work(req, res).catch(next); };
function residence(row: any) {
  return { id: row.id, name: row.name, location: row.location, description: row.description,
    image: row.cover_path, imageUrl: row.cover_path, gallery: row.gallery_paths,
    contact_phone: row.contact_phone, contact_email: row.contact_email,
    latitude:row.latitude === null ? null : Number(row.latitude),longitude:row.longitude === null ? null : Number(row.longitude),
    landmark:row.landmark,city:row.city,region:row.region,
    registrationDate: row.registered_at, isApproved: true, approvalStatus: 'Approved' };
}
function store(row: any) {
  return { id: row.id, storeName: row.name, username:row.username, university: row.campus, location: row.location,
    category: row.primary_category, deliveryMode: row.delivery_mode, deliveryForm: row.delivery_mode,
    description: row.description, phone: row.primary_phone,phoneCountry:row.phone_country,
    profilePicture: row.logo_path || MARKET_DEFAULT_LOGO, logoUrl: row.logo_path || MARKET_DEFAULT_LOGO,
    coverPicture: row.cover_path || MARKET_DEFAULT_COVERS[0].url, bannerUrl: row.cover_path || MARKET_DEFAULT_COVERS[0].url,
    storeRating: Number(row.rating || 0), ratingCount: Number(row.rating_count || 0) };
}
export async function publicProducts(db: SupabaseDatabase, storeId?: string) {
  const rows = await db.publicRows(`select l.*, s.name as store_name, s.campus, s.primary_phone, s.logo_path, s.plan,
      (select coalesce(round(avg(r.rating),1),0) from public.market_reviews_public r where r.listing_id = l.id) as rating,
      (select count(*) from public.market_reviews_public r where r.listing_id = l.id) as review_count,
      (select coalesce(round(avg(r.rating),1),0) from public.market_reviews_public r where r.store_id = l.store_id) as store_rating,
      (select count(*) from public.market_reviews_public r where r.store_id = l.store_id) as store_rating_count,
      coalesce((select jsonb_agg(m.storage_path order by m.sort_order) from public.listing_media_public m where m.listing_id = l.id),'[]'::jsonb) as images,
      coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.label,'price',o.price,'imageUrl',o.image_path) order by o.sort_order) from public.listing_price_options_public o where o.listing_id = l.id),'[]'::jsonb) as price_options
    from public.listing_catalog l join public.store_catalog s on s.id = l.store_id
    where ($1::uuid is null or l.store_id = $1) order by l.created_at desc`, [storeId || null]);
  return rows.map((row: any) => ({ ...marketPlanBenefits(row.plan === 'pine_pro' ? 'pro' : row.plan === 'pine_star' ? 'star' : 'default'), id: row.id, storeId: row.store_id, title: row.title, description: row.description,
    category: row.category, price: Number(row.price), currency: row.currency,
    isService: row.kind === 'service', serviceCategory:row.service_category, serviceLocationMode: row.service_location_mode,
    lat: row.latitude === null ? null : Number(row.latitude), lng: row.longitude === null ? null : Number(row.longitude),
    isAvailable: row.is_available, imageUrl: row.images[0] || '', additionalImages: row.images.slice(1),
    priceCategories: row.price_options, storeName: row.store_name, sellerName: row.store_name,
    stockQuantity: row.stock_quantity === null ? null : Number(row.stock_quantity), condition: row.condition,
    meetingLocation: row.meeting_location, callLine: row.call_line, workingDays: row.working_days,
    openingTime: row.opening_time, closingTime: row.closing_time, isOpen247: row.is_open_247,
    sellerUniversity: row.campus, sellerPhone: row.primary_phone, storeLogoUrl: row.logo_path || MARKET_DEFAULT_LOGO,
    rating: Number(row.rating), reviewCount: Number(row.review_count), storeRating: Number(row.store_rating), ratingCount: Number(row.store_rating_count) }));
}
export function installCatalog(app: Express, db: SupabaseDatabase) {
  app.get('/api/hostels', route(async (_req, res) => res.json((await db.publicRows('select * from public.residence_catalog order by registered_at desc')).map(residence))));
  app.get('/api/hostels/:id', route(async (req, res) => {
    const rows = await db.publicRows('select * from public.residence_catalog where id = $1', [uuid(req.params.id)]);
    if (!rows.length) throw new ApiError(404, 'Residence not found.'); return res.json(residence(rows[0]));
  }));
  app.get('/api/digital-market/products', route(async (req, res) => {
    // includeAll and sellerEmail never widen a public query into private inventory.
    return res.json(await publicProducts(db, req.query.storeId ? uuid(req.query.storeId) : undefined));
  }));
  app.get('/api/digital-market/stores/:id', route(async (req, res) => {
    const id = uuid(req.params.id);
    const rows = await db.publicRows(`select s.*,
      (select coalesce(round(avg(r.rating),1),0) from public.market_reviews_public r where r.store_id = s.id) as rating,
      (select count(*) from public.market_reviews_public r where r.store_id = s.id) as rating_count
      from public.store_catalog s where s.id = $1`, [id]);
    if (!rows.length) throw new ApiError(404, 'Store not found.');
    return res.json({ store: store(rows[0]), products: await publicProducts(db, id) });
  }));
}
