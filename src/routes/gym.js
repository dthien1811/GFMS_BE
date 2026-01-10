

import express from 'express';
import gymController from '../controllers/gymController';
import jwtAction from "../middleware/JWTAction";
import { checkUserPermission } from "../middleware/permission";

let router = express.Router();

let gymRoute = (app) => {
  
  // ✅ Protect all gym routes with JWT + permission
  router.use(jwtAction.checkUserJWT);
  router.use(
    checkUserPermission({
      // map path thực tế: /api/gym/...  => /admin/gyms/...
      getPath: (req) => {
        const fullPath = `${req.baseUrl}${req.path}`;
        return fullPath.replace(/^\/api\/gym/, "/admin/gyms");
      },
    })
  );

  router.get('/', gymController.getAllGyms);
  router.get('/:id/detail', gymController.getGymDetail); 
  router.get('/:id/images', gymController.getImages); 
  router.get('/:id',  gymController.getGymById);


  router.post('/', gymController.createGym);
  router.post('/:id/images', gymController.addImage); 
  
  
  router.put('/:id/suspend', gymController.suspendGym); 
  router.put('/:id/restore', gymController.restoreGym); 
  router.put('/:id/operating-hours',gymController.updateOperatingHours); 
  router.put('/:id/images', gymController.updateImages); 
  router.put('/:id', gymController.updateGym);
  
  
  router.delete('/:id/images', gymController.removeImage); 
  router.delete('/:id', gymController.deleteGym);

  return app.use('/api/gym', router);
};

module.exports = gymRoute;

