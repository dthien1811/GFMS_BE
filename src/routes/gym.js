

import express from 'express';
import gymController from '../controllers/gymController';

let router = express.Router();

let gymRoute = (app) => {
  
  

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

