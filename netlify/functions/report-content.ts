import { reportContent } from '../lib/handlers/report';
import { netlifyFunction } from '../lib/function';

export default netlifyFunction('report-content', reportContent);
