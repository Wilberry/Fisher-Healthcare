import { phase2PublicPost } from '../../../../lib/phase2-proxy';
export async function POST(req:Request){return phase2PublicPost('quotes',req);}
