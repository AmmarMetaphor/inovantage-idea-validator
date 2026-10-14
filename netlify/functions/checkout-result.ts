import { checkoutResult } from '../lib/handlers/report';
import { netlifyFunction } from '../lib/function';

export default netlifyFunction('checkout-result', checkoutResult);
