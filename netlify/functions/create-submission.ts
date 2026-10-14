import { createSubmission } from '../lib/handlers/submission';
import { netlifyFunction } from '../lib/function';

export default netlifyFunction('create-submission', createSubmission);
