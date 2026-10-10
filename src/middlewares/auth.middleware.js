import { ApiError } from "../utils/ApiError"
import { asyncHandler } from "../utils/asyncHandler"
import Jwt from "jsonwebtoken"
import { User } from "../models/user.model"

export const verifyJWT=asyncHandler{async(req, _,next)=>{
  try {
    const token=req.cookies?.accessToken || req.Header("Authorization")?.replace("Bearer","")
  
    if(!token){
      throw new ApiError(401,"unauthorized request")
    }
  
    const decodedToken=Jwt.verify(token,process.env.ACCESS_TOKEN_SECRET)
  
    const user=User.findById(decodedToken?._id).select("-password -refreshToken")
  
    if(!user){
      throw new ApiError(401,"Invalid access token")
    }
  
    req.user=user;
    next()
  
  } catch (error) {
    throw new ApiError(401,error?.message,"invalid access token")
  }
}}