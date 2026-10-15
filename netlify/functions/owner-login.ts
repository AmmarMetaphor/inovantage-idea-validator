import { ownerLogin } from '../lib/handlers/owner';
import { netlifyFunction } from '../lib/function';

export default netlifyFunction('owner-login', ownerLogin);
