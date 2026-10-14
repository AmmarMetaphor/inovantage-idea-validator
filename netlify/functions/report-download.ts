import { reportDownload } from '../lib/handlers/report';
import { netlifyFunction } from '../lib/function';

export default netlifyFunction('report-download', reportDownload);
