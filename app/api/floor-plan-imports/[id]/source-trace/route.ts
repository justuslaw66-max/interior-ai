import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readBoundedJsonObject } from "@/lib/bounded-request-body";
import { takeSharedRateLimit } from "@/lib/shared-rate-limit";
import { previewSourceTrace,acceptSourceTrace } from "@/lib/floor-plan-imports/source-trace-review";
export const runtime="nodejs";
export const maxDuration=60;
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  const session=await auth();if(!session?.user?.id)return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params,userId=session.user.id;
  if(!await prisma.floorPlanImportJob.findFirst({where:{id,userId,historyDeletedAt:null},select:{id:true}}))return NextResponse.json({error:"Import not found"},{status:404});
  try{
    const body=await readBoundedJsonObject(request,4096);
    if(!Number.isSafeInteger(body.candidateVersion)||!Number.isSafeInteger(body.pageNumber))throw new Error("A current source page and review version are required.");
    const input={jobId:id,userId,candidateVersion:Number(body.candidateVersion),pageNumber:Number(body.pageNumber),signal:request.signal};
    if(body.action==="accept"&&typeof body.assetId==="string")return NextResponse.json({job:await acceptSourceTrace({...input,assetId:body.assetId})},{status:201,headers:{"Cache-Control":"private, no-store"}});
    if(body.action!=="preview")throw new Error("Choose preview or accept.");
    const rate=await takeSharedRateLimit(prisma,{scope:"floor-plan-source-trace",subject:userId,limit:4,windowMs:60_000});
    if(!rate.ok)return NextResponse.json({error:"Wait before tracing another image."},{status:429});
    return NextResponse.json(await previewSourceTrace(input),{headers:{"Cache-Control":"private, no-store"}});
  }catch(cause){return NextResponse.json({error:cause instanceof Error?cause.message:"Unable to trace source artwork."},{status:409});}
}
