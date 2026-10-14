import { recoverReport } from '../lib/handlers/report';
import { netlifyFunction } from '../lib/function';

export default netlifyFunction('recover-report', recoverReport);
