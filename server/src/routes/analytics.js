import { Router } from "express";
import { analyticsConfig } from "../services/googleAnalytics.js";
const router=Router();
router.get("/config",async (req,res,next)=>{
  try {
    const config=await analyticsConfig();
    res.set("Cache-Control","no-store").json({enabled:config.enabled,measurementId:config.enabled?config.measurementId:null});
  } catch(error){next(error);}
});
export default router;
