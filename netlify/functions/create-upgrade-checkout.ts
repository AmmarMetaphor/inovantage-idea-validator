import { createUpgradeCheckout } from '../lib/handlers/report';
import { netlifyFunction } from '../lib/function';

export default netlifyFunction('create-upgrade-checkout', createUpgradeCheckout);
