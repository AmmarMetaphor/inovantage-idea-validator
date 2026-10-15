import { ownerSession } from '../lib/handlers/owner';
import { netlifyFunction } from '../lib/function';

export default netlifyFunction('owner-session', ownerSession);
