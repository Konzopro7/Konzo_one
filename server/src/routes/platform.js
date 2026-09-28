import { Router } from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { isPlatformAdminEmail } from "../utils/platformAdmin.js";
import { listSecurityEvents } from "../services/securityAudit.js";
import { z } from "zod";
import { pagination, searchPattern, resources, platformAudit, updatePlatformAgency, updatePlatformUser } from "../services/platformAdmin.js";
import { analyticsConfig, analyticsReport } from "../services/googleAnalytics.js";
import { withTransaction } from "../db.js";

const router = Router();

router.use(requireAuth);

router.use((req, res, next) => {
  if (!isPlatformAdminEmail(req.user.email)) {
    return res.status(403).json({
      message: "Platform admin access required."
    });
  }

  return next();
});

router.get("/security", async (req, res, next) => {
  try { res.json(await listSecurityEvents(req)); } catch (error) { next(error); }
});

router.get('/newsletter',async(req,res,next)=>{
  try {
    const {page,limit}=pagination(req);
    const status=['subscribed','pending','unsubscribed'].includes(req.query.status)?req.query.status:'subscribed';
    const {rows}=await query(`SELECT n.user_id,u.full_name,n.email,n.status,n.confirmed_at,n.unsubscribed_at,a.name AS agency
      FROM newsletter_subscriptions n JOIN users u ON u.id=n.user_id JOIN agencies a ON a.id=n.agency_id
      WHERE n.status=$1 AND n.email=u.email AND u.is_active AND (n.status<>'subscribed' OR n.confirmed_at IS NOT NULL)
      AND (n.email ILIKE $2 OR u.full_name ILIKE $2 OR a.name ILIKE $2)
      ORDER BY n.updated_at DESC,n.user_id DESC LIMIT $3 OFFSET $4`,[status,searchPattern(req.query.search),limit+1,(page-1)*limit]);
    res.set('Cache-Control','no-store').json({page,hasMore:rows.length>limit,items:rows.slice(0,limit)});
  } catch(error){next(error);}
});
router.put('/contact',async(req,res,next)=>{
  try {
    const parsed=z.object({phone:z.string().trim().max(40).refine(value=>value==='' || (/^[+()\d .-]+$/.test(value) && /^\d{7,15}$/.test(value.replace(/\D/g,''))), 'Vérifiez le numéro de téléphone.')}).strict().safeParse(req.body);
    if(!parsed.success)return res.status(400).json({message:'Indiquez un numéro de téléphone valide avec son indicatif.'});
    await withTransaction(async db=>{
      const before=(await db.query('SELECT support_phone FROM platform_settings WHERE id=1 FOR UPDATE')).rows[0];
      await db.query('UPDATE platform_settings SET support_phone=$1,updated_at=NOW() WHERE id=1',[parsed.data.phone || null]);
      await platformAudit(req,req.user.agencyId,'ADMIN_UPDATE','platform_settings',1,before,{support_phone:parsed.data.phone},db);
    });
    res.json(parsed.data);
  }catch(error){next(error);}
});

const validId=value=>/^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
router.get("/agencies/:id/:resource/:recordId",async(req,res,next)=>{
  try{
    const id=validId(req.params.id),recordId=validId(req.params.recordId);
    if(!id||!recordId||!Object.hasOwn(resources,req.params.resource))return res.status(400).json({message:"Fiche invalide."});
    const module=resources[req.params.resource];
    const privateFields=["password_hash","mfa_secret","mfa_version","mfa_last_step","mfa_recovery_hashes","mfa_failures","mfa_blocked_until","public_token","payment_link_token","stripe_checkout_session_id","stripe_payment_intent_id","agency_id","created_by"];
    const {rows}=await query(`SELECT to_jsonb(t)-$3::text[] AS record FROM ${module.table} t WHERE agency_id=$1 AND id=$2`,[id,recordId,privateFields]);
    if(!rows[0])return res.status(404).json({message:"Fiche introuvable dans cette entreprise."});
    const lineModule={quotes:["quote_items","quote_id"],invoices:["invoice_items","invoice_id"],purchases:["purchase_items","purchase_id"]}[req.params.resource];
    const items=lineModule?(await query(`SELECT description,unit_price,quantity,line_total FROM ${lineModule[0]} WHERE ${lineModule[1]}=$1 ORDER BY id`,[recordId])).rows:[];
    await platformAudit(req,id,"ADMIN_VIEW",module.table,recordId,null,{recordId});
    res.json({record:rows[0].record,items});
  }catch(error){next(error);}
});
router.get("/agencies",async(req,res,next)=>{
  try {
    const {page,limit}=pagination(req);
    const params=[searchPattern(req.query.search)];
    const filters=["a.name ILIKE $1"];
    if (["trial","active","past_due","canceled"].includes(req.query.status)) {params.push(req.query.status);filters.push(`a.subscription_status=$${params.length}`);}
    params.push(limit+1,(page-1)*limit);
    const {rows}=await query(`SELECT a.id,a.name,a.plan_tier,a.subscription_status,a.is_suspended,a.created_at,a.trial_ends_at,a.stripe_subscription_id IS NOT NULL AS stripe_managed,
      (SELECT COUNT(*)::INT FROM users u WHERE u.agency_id=a.id) AS users,
      (SELECT COUNT(*)::INT FROM clients c WHERE c.agency_id=a.id) AS clients
      ,COALESCE((SELECT currency FROM agency_settings s WHERE s.agency_id=a.id),'CAD') AS currency
      FROM agencies a WHERE ${filters.join(" AND ")} ORDER BY a.created_at DESC,a.id DESC LIMIT $${params.length-1} OFFSET $${params.length}`,params);
    res.json({page,hasMore:rows.length>limit,items:rows.slice(0,limit)});
  }catch(error){next(error);}
});
router.get("/agencies/:id/:resource",async(req,res,next)=>{
  try {
    const id=validId(req.params.id);
    if (!id || !Object.hasOwn(resources,req.params.resource)) return res.status(400).json({message:"Module ou entreprise invalide."});
    const module=resources[req.params.resource];
    const exists=await query("SELECT name FROM agencies WHERE id=$1",[id]);
    if(!exists.rows[0]) return res.status(404).json({message:"Entreprise introuvable."});
    const {page,limit}=pagination(req);
    const {rows}=await query(`SELECT id,${module.title} AS title,${module.extra},created_at FROM ${module.table} WHERE agency_id=$1 AND (${module.title} ILIKE $2 ${module.search?`OR ${module.search} ILIKE $2`:""}) ORDER BY created_at DESC,id DESC LIMIT $3 OFFSET $4`,[id,searchPattern(req.query.search),limit+1,(page-1)*limit]);
    await platformAudit(req,id,"ADMIN_VIEW",module.table,id,null,{page,resource:req.params.resource});
    res.json({page,hasMore:rows.length>limit,columns:module.columns,items:rows.slice(0,limit)});
  }catch(error){next(error);}
});
const reason=z.string().trim().min(10).max(500);
router.patch("/users/:id",async(req,res,next)=>{
  try{
    const id=validId(req.params.id),parsed=z.object({role:z.enum(["admin","commercial","finance","readonly"]).optional(),isActive:z.boolean().optional(),reason}).strict().refine(p=>p.role!==undefined||p.isActive!==undefined).safeParse(req.body);
    if(!id||!parsed.success)return res.status(400).json({message:"Vérifiez le rôle, le statut et le motif (10 caractères minimum)."});
    const result=await updatePlatformUser(req,id,parsed.data);res.status(result.status||200).json(result);
  }catch(error){next(error);}
});
router.patch("/agencies/:id",async(req,res,next)=>{
  try{
    const id=validId(req.params.id),parsed=z.object({isSuspended:z.boolean().optional(),planTier:z.enum(["pro","premium"]).optional(),subscriptionStatus:z.enum(["trial","active","past_due","canceled"]).optional(),reason}).strict().refine(p=>p.isSuspended!==undefined||p.planTier!==undefined||p.subscriptionStatus!==undefined).safeParse(req.body);
    if(!id||!parsed.success)return res.status(400).json({message:"Vérifiez les paramètres et le motif (10 caractères minimum)."});
    const result=await updatePlatformAgency(req,id,parsed.data);res.status(result.status||200).json(result);
  }catch(error){next(error);}
});
router.get("/actions",async(req,res,next)=>{
  try{
    const {page,limit}=pagination(req);
    const {rows}=await query(`SELECT l.id,l.action,l.entity_type,l.entity_id,l.metadata,l.created_at,u.email AS actor,a.name AS agency FROM audit_logs l LEFT JOIN users u ON u.id=l.user_id LEFT JOIN agencies a ON a.id=l.agency_id WHERE l.action IN ('ADMIN_VIEW','ADMIN_UPDATE','GA4_CONFIG') ORDER BY l.created_at DESC,l.id DESC LIMIT $1 OFFSET $2`,[limit+1,(page-1)*limit]);
    res.json({page,hasMore:rows.length>limit,items:rows.slice(0,limit)});
  }catch(error){next(error);}
});
router.get("/analytics/config",async(req,res,next)=>{try{res.json(await analyticsConfig());}catch(error){next(error);}});
router.put("/analytics/config",async(req,res,next)=>{
  try {
    const parsed=z.object({enabled:z.boolean(),measurementId:z.string().regex(/^$|^G-[A-Z0-9]{6,20}$/),propertyId:z.string().regex(/^$|^[1-9]\d{3,19}$/),manualMeasurementConfirmed:z.boolean(),reason}).strict().refine(p=>!p.enabled||(Boolean(p.measurementId)&&p.manualMeasurementConfirmed)).safeParse(req.body);
    if(!parsed.success)return res.status(400).json({message:"Vérifiez les identifiants GA4 et le motif. L’activation nécessite un identifiant G-… valide."});
    await withTransaction(async db=>{
      const before=await db.query("SELECT ga4_enabled,ga4_measurement_id,ga4_property_id FROM platform_settings WHERE id=1 FOR UPDATE");
      await db.query("UPDATE platform_settings SET ga4_enabled=$1,ga4_measurement_id=$2,ga4_property_id=$3,updated_at=NOW() WHERE id=1",[parsed.data.enabled,parsed.data.measurementId||null,parsed.data.propertyId||null]);
      await platformAudit(req,req.user.agencyId,"GA4_CONFIG","platform_settings",1,before.rows[0],parsed.data,db);
    });
    res.json(await analyticsConfig());
  }catch(error){next(error);}
});
router.get("/analytics/report",async(req,res,next)=>{
  const days=[7,30,90].includes(Number(req.query.days))?Number(req.query.days):30;
  try{res.set("Cache-Control","no-store").json(await analyticsReport(days));}
  catch{res.status(503).json({message:"Rapport GA4 inaccessible. Vérifiez l’accès du compte de service à la propriété et l’activation de l’API Google Analytics Data."});}
});

router.get("/overview", async (req, res, next) => {
  try {
    const [agenciesRes, usersRes, signupsRes, trafficRes, topPathsRes, recentRes] =
      await Promise.all([
        query(
          `SELECT
            COUNT(*)::INT AS total_agencies,
            COUNT(*) FILTER (WHERE subscription_status = 'trial' AND trial_ends_at > NOW())::INT AS active_trials,
            COUNT(*) FILTER (WHERE subscription_status = 'active')::INT AS active_subscriptions,
            COUNT(*) FILTER (WHERE subscription_status = 'past_due')::INT AS past_due,
            COUNT(*) FILTER (WHERE subscription_status = 'canceled')::INT AS canceled,
            COUNT(*) FILTER (WHERE plan_tier = 'pro')::INT AS pro_count,
            COUNT(*) FILTER (WHERE plan_tier = 'premium')::INT AS premium_count
            ,COUNT(*) FILTER (WHERE subscription_status='active' AND plan_tier='pro')::INT AS active_pro
            ,COUNT(*) FILTER (WHERE subscription_status='active' AND plan_tier='premium')::INT AS active_premium
            ,COUNT(*) FILTER (WHERE is_suspended)::INT AS suspended
           FROM agencies`
        ),
        query(
          `SELECT
            COUNT(*)::INT AS total_users,
            COUNT(*) FILTER (WHERE is_active = true)::INT AS active_users,
            COUNT(*) FILTER (WHERE is_active = true AND mfa_enabled = true)::INT AS protected_users
           FROM users`
        ),
        query(
          `WITH day_series AS (
            SELECT generate_series(
              CURRENT_DATE - INTERVAL '29 days',
              CURRENT_DATE,
              INTERVAL '1 day'
            )::DATE AS day
          ),
          signups AS (
            SELECT created_at::DATE AS day, COUNT(*)::INT AS value
            FROM agencies
            WHERE created_at >= CURRENT_DATE - INTERVAL '29 days'
            GROUP BY created_at::DATE
          )
          SELECT
            ds.day::TEXT AS day,
            COALESCE(s.value, 0)::INT AS value
          FROM day_series ds
          LEFT JOIN signups s ON s.day = ds.day
          ORDER BY ds.day ASC`
        ),
        query(
          `WITH day_series AS (
            SELECT generate_series(
              CURRENT_DATE - INTERVAL '29 days',
              CURRENT_DATE,
              INTERVAL '1 day'
            )::DATE AS day
          ),
          reqs AS (
            SELECT created_at::DATE AS day, COUNT(*)::INT AS value
            FROM api_request_logs
            WHERE created_at >= CURRENT_DATE - INTERVAL '29 days'
            GROUP BY created_at::DATE
          )
          SELECT
            ds.day::TEXT AS day,
            COALESCE(r.value, 0)::INT AS value
          FROM day_series ds
          LEFT JOIN reqs r ON r.day = ds.day
          ORDER BY ds.day ASC`
        ),
        query(
          `SELECT
            path,
            COUNT(*)::INT AS count
           FROM api_request_logs
           WHERE created_at >= NOW() - INTERVAL '7 days'
           GROUP BY path
           ORDER BY count DESC
           LIMIT 8`
        ),
        query(
          `SELECT
            l.id,
            l.method,
            l.path,
            l.status_code,
            l.duration_ms,
            l.created_at,
            a.name AS agency_name,
            u.full_name AS user_name,
            u.email AS user_email
           FROM api_request_logs l
           LEFT JOIN agencies a ON a.id = l.agency_id
           LEFT JOIN users u ON u.id = l.user_id
           ORDER BY l.created_at DESC
           LIMIT 40`
        )
      ]);

    const agencies = agenciesRes.rows[0] || {};
    const users = usersRes.rows[0] || {};

    const proCount = Number(agencies.pro_count || 0);
    const premiumCount = Number(agencies.premium_count || 0);
    const monthlyRevenueEstimate =
      Number(agencies.active_pro||0) * Number(process.env.PLAN_PRICE_PRO_MONTHLY || 49) +
      Number(agencies.active_premium||0) * Number(process.env.PLAN_PRICE_PREMIUM_MONTHLY || 99);

    return res.json({
      metrics: {
        totalAgencies: Number(agencies.total_agencies || 0),
        activeTrials: Number(agencies.active_trials || 0),
        activeSubscriptions: Number(agencies.active_subscriptions || 0),
        pastDue: Number(agencies.past_due || 0),
        canceled: Number(agencies.canceled || 0),
        totalUsers: Number(users.total_users || 0),
        activeUsers: Number(users.active_users || 0),
        protectedUsers: Number(users.protected_users || 0),
        suspendedAgencies: Number(agencies.suspended||0),
        proCount,
        premiumCount,
        monthlyRevenueEstimate
      },
      signupSeries: signupsRes.rows.map((row) => ({
        day: row.day,
        value: Number(row.value || 0)
      })),
      trafficSeries: trafficRes.rows.map((row) => ({
        day: row.day,
        value: Number(row.value || 0)
      })),
      topPaths: topPathsRes.rows.map((row) => ({
        path: row.path,
        count: Number(row.count || 0)
      })),
      recentActivity: recentRes.rows.map((row) => ({
        id: row.id,
        method: row.method,
        path: row.path,
        statusCode: Number(row.status_code || 0),
        durationMs: Number(row.duration_ms || 0),
        createdAt: row.created_at,
        agencyName: row.agency_name || "Unknown agency",
        userName: row.user_name || null,
        userEmail: row.user_email || null
      }))
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
