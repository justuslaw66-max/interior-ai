import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { takeSharedRateLimit } from "@/lib/shared-rate-limit";
import { readBoundedJsonObject } from "@/lib/bounded-request-body";
import { forkPhotoReview } from "@/lib/floor-plan-imports/photo-review-fork";

export const runtime="nodejs";
export const maxDuration=300;
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  const session=await auth();if(!session?.user?.id)return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params,userId=session.user.id;
  const owned=await prisma.floorPlanImportJob.findFirst({where:{id,userId,historyDeletedAt:null},select:{id:true}});
  if(!owned)return NextResponse.json({error:"Floor-plan import not found"},{status:404});
  const allowance=await takeSharedRateLimit(prisma,{scope:"floor-plan-photo-review",subject:userId,limit:4,windowMs:60_000});
  if(!allowance.ok)return NextResponse.json({error:"Wait before recomputing another photo review"},{status:429});
  try {
    const body=await readBoundedJsonObject(request,64*1024);
    if(!Number.isSafeInteger(body.candidateVersion)||!Number.isSafeInteger(body.pageNumber))throw new Error("A current review version and source page are required.");
    const job=await forkPhotoReview({jobId:id,userId,candidateVersion:Number(body.candidateVersion),pageNumber:Number(body.pageNumber),constraints:body.constraints});
    return NextResponse.json({job},{status:201,headers:{"Cache-Control":"private, no-store"}});
  }catch(cause){return NextResponse.json({error:cause instanceof Error?cause.message:"Unable to recompute the photo review"},{status:409});}
}
