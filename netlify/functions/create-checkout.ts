import { createCheckout } from '../lib/handlers/submission';
import { netlifyFunction } from '../lib/function';

export default netlifyFunction('create-checkout', createCheckout);
