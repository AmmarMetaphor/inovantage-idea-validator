import { createPilotOrder } from '../lib/handlers/owner';
import { netlifyFunction } from '../lib/function';

export default netlifyFunction('pilot-order', createPilotOrder);
