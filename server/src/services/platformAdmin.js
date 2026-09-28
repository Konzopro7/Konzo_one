import { query, withTransaction } from "../db.js";
import { isPlatformAdminEmail } from "../utils/platformAdmin.js";

export const resources = {
  users: { table:"users", title:"full_name", extra:"email, role, is_active, mfa_enabled", search:"email", columns:["title","email","role","is_active","mfa_enabled","created_at"] },
  clients: { table:"clients", title:"name", extra:"email, company, phone", search:"email", columns:["title","company","email","phone","created_at"] },
  prospects: { table:"prospects", title:"name", extra:"email, source, status", search:"email", columns:["title","email","source","status","created_at"] },
  opportunities: { table:"opportunities", title:"title", extra:"stage AS status, value AS amount, probability", columns:["title","status","amount","probability","created_at"] },
  quotes: { table:"quotes", title:"quote_number", extra:"status, total AS amount, client_id", columns:["title","status","amount","client_id","created_at"] },
  invoices: { table:"invoices", title:"invoice_number", extra:"status, total AS amount, due_date, client_id", columns:["title","status","amount","due_date","client_id","created_at"] },
  suppliers: { table:"suppliers", title:"name", extra:"email, company, phone", search:"email", columns:["title","company","email","phone","created_at"] },
  purchases: { table:"purchases", title:"purchase_number", extra:"status, total AS amount", columns:["title","status","amount","created_at"] },
  expenses: { table:"expenses", title:"expense_number", extra:"status, category, total AS amount", columns:["title","status","category","amount","created_at"] },
  inventory: { table:"inventory_items", title:"name", extra:"sku, stock_quantity, sale_price AS amount", search:"sku", columns:["title","sku","stock_quantity","amount","created_at"] }
};
export function pagination(req) { return { page: Math.max(1,Math.min(10000,parseInt(req.query.page,10)||1)), limit:20 }; }
export function searchPattern(value) { return `%${String(value||"").trim().slice(0,120).replace(/[\\%_]/g,"\\$&")}%`; }
export async function platformAudit(req, agencyId, action, type, id, before, after, db={query}) {
  await db.query(`INSERT INTO audit_logs(agency_id,user_id,action,entity_type,entity_id,path,status_code,metadata) VALUES($1,$2,$3,$4,$5,$6,200,$7)`,
    [agencyId,req.user.id,action,type,id,`/api/platform${req.path}`.slice(0,255),JSON.stringify({before,after,reason:req.body?.reason||null,ip:req.ip||null})]);
}
export async function updatePlatformUser(req, id, payload) {
  return withTransaction(async db => {
    const location = await db.query("SELECT agency_id FROM users WHERE id=$1",[id]);
    if (!location.rows[0]) return {status:404,message:"Utilisateur introuvable."};
    await db.query("SELECT id FROM agencies WHERE id=$1 FOR UPDATE",[location.rows[0].agency_id]);
    const {rows}=await db.query("SELECT id,agency_id,email,role,is_active FROM users WHERE id=$1 FOR UPDATE",[id]);
    const target=rows[0];
    if (!target || target.agency_id!==location.rows[0].agency_id) return {status:409,message:"Le compte a changé. Actualisez la page."};
    if (id===req.user.id || isPlatformAdminEmail(target.email)) return {status:409,message:"Les comptes de la plateforme sont protégés contre ces modifications."};
    const role=payload.role ?? target.role, active=payload.isActive ?? target.is_active;
    if (target.role==="admin" && target.is_active && (role!=="admin" || !active)) {
      const admins=await db.query("SELECT COUNT(*)::INT AS n FROM users WHERE agency_id=$1 AND role='admin' AND is_active=true",[target.agency_id]);
      if (admins.rows[0].n<=1) return {status:409,message:"Conservez au moins un administrateur actif dans cette entreprise."};
    }
    await db.query("UPDATE users SET role=$1,is_active=$2,mfa_version=mfa_version+1,updated_at=NOW() WHERE id=$3",[role,active,id]);
    await platformAudit(req,target.agency_id,"ADMIN_UPDATE","users",id,{role:target.role,isActive:target.is_active},{role,isActive:active},db);
    return {ok:true};
  });
}
export async function updatePlatformAgency(req,id,payload) {
  return withTransaction(async db => {
    const {rows}=await db.query("SELECT id,is_suspended,plan_tier,subscription_status,stripe_subscription_id FROM agencies WHERE id=$1 FOR UPDATE",[id]);
    const target=rows[0];
    if (!target) return {status:404,message:"Entreprise introuvable."};
    if (id===req.user.agencyId && payload.isSuspended) return {status:409,message:"Votre propre espace administrateur ne peut pas être suspendu."};
    const billingChange = (payload.planTier && payload.planTier!==target.plan_tier) || (payload.subscriptionStatus && payload.subscriptionStatus!==target.subscription_status);
    if (billingChange && target.stripe_subscription_id) return {status:409,message:"Cet abonnement est géré par Stripe. Modifiez-le depuis Stripe pour conserver la synchronisation."};
    const next={isSuspended:payload.isSuspended??target.is_suspended,planTier:payload.planTier??target.plan_tier,subscriptionStatus:payload.subscriptionStatus??target.subscription_status};
    await db.query("UPDATE agencies SET is_suspended=$1,plan_tier=$2,subscription_status=$3,updated_at=NOW() WHERE id=$4",[next.isSuspended,next.planTier,next.subscriptionStatus,id]);
    await platformAudit(req,id,"ADMIN_UPDATE","agencies",id,{isSuspended:target.is_suspended,planTier:target.plan_tier,subscriptionStatus:target.subscription_status},next,db);
    return {ok:true};
  });
}
