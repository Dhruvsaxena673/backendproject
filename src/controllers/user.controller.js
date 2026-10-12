import { ApiError } from '../utils/ApiError.js'
import {asyncHandler} from '../utils/asyncHandler.js'
import {User} from "../models/user.model.js"
import { uploadOnCloudinary } from '../utils/cloudinary.js'
import { ApiResponse } from '../utils/ApiResponse.js'
import jwt from "jsonwebtoken"
import mongoose from 'mongoose'

const generateAccessAndRefreshTokens= async(userId)=>{
  try {
    const user=await User.findById(userId)
    const accessToken=user.generateAccessToken()
    const refreshToken=user.generateRefreshToken()

    user.refreshToken=refreshToken
    await user.save({validateBeforeSave: false})

    return({accessToken,refreshToken})
 
  } catch (error) {
    throw new ApiError(500,"something went wrong while genrating access and refresh token")
  }
}


const registerUser=asyncHandler(async(req,res)=>{
  

  const {fullname,email,username,password}=req.body
  if([fullname,email,username,password].some((field)=>
    field?.trim()==="")
  )
  {
    throw new ApiError(400,'All fields are required')
  }

  const existedUser=await User.findOne({
    $or:[{username},{email}]
  })
  if(existedUser){
    throw new ApiError(409,"User with email or username is already exist")
  }

  const avatarLocalPath=req.files?.avatar[0]?.path
  //const coverImageLocalPath=req.files?.coverImage[0]?.path

  let coverImageLocalPath;
  if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
  coverImageLocalPath = req.files.coverImage[0].path;
  }


  if(!avatarLocalPath){
    throw new ApiError(400,"Avatar file is required")
  }
  const avatar=await uploadOnCloudinary(avatarLocalPath)
  const coverImage=await uploadOnCloudinary(coverImageLocalPath)

  if(!avatar){
    throw new ApiError(400,"Avatar file is required")
  }

 const user= await User.create({
    fullname,
    avatar:avatar.url,
    coverImage:coverImage?.url || "",
    email,
    password,
    username:username.toLowerCase()
  })
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  )

  if(!createdUser){
    throw new ApiError(500,"Something went wrong while registering user")
  }
 return res.status(201).json(
  new ApiResponse(200,createdUser,"user register successfully")
 )
})

const loginUser=asyncHandler(async(req,res)=>{
  // 1. Extract email or username and password from request body
  const {email,username,password}=req.body
  if(!username&&!email){
    throw new ApiError(400,"Username or email is required")
  }
  // 2. Find user in the database by email or username
  const user=await User.findOne({
    $or:[{username},{email}]
  })
  
  if(!user){
    throw new ApiError(404,"user does not exist")
  }
  // 3. Verify password match using the bcrypt method defined in the model schema
  const isPasswordValid=await user.isPasswordCorrect(password)

  if(!isPasswordValid){
    throw new ApiError(401,"password incorrect")
  }
  // 4. Generate Access and Refresh tokens
  const {accessToken,refreshToken}=await generateAccessAndRefreshTokens(user._id)
  // 5. Fetch logged-in user details (excluding sensitive fields like password and refresh token)
  const loggedInUser = await User.findById(user._id).select("-password -refreshToken");
  // 6. Define cookie options for secure token storage
  const options={
    httpOnly:true,
    secure:true
  }
  // 7. Send response setting cookies and returning user data
  return res
  .status(200)
  .cookie("accessToken",accessToken,options)
  .cookie("refreshToken",refreshToken,options)
  .json(
    new ApiResponse(
      200,{
      user:loggedInUser,accessToken,refreshToken
    },
    "User logged in successfully"
    )
  )

})

const logoutUser=asyncHandler(async(req,res)=>{
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set:{
        refreshToken:undefined
      }
    },
    {
      new:true
    }
  )
  const options={
    httpOnly:true,
    secure:true
  }
  return res
  .status(200)
  .clearCookie("accessToken",options)
  .clearCookie("refreshToken",options)
  .json(
    new ApiResponse(
      200,
      {},
      "User logged out successfully"
    )
  )
})

const refreshAccessToken = asyncHandler(async (req, res) => {
  try {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;
  
    if (!incomingRefreshToken) {
      throw new ApiError(401, "unauthorized request");
    }
  
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );
  
    const user = await User.findById(decodedToken?.id);
  
    if (!user) {
      throw new ApiError(401, "invalid refresh token");
    }
  
    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or used");
    }
  
    const options = {
      httpOnly: true,
      secure: true 
    };

    const { accessToken, refreshToken: newRefreshToken } = await generateAccessAndRefreshTokens(user._id);
  
    return res
      .status(200)
      .cookie("accessToken", accessToken, options)  
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken: newRefreshToken },
          "Access token refreshed"
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token");
  }
});

const changeCurrentPassword= asyncHandler(async(req,res)=>{
  const{oldPassword,newPassword}=req.body

  const user=await User.findById(req.user?._id)

  const isPasswordCorrect=await user.isPasswordCorrect(oldPassword)

  if(!isPasswordCorrect){
    throw new ApiError(400,"Error!, Check your password")
  }

  user.password=newPassword

  await user.save({validateBeforeSave:false})

  return res
  .status(200)
  .json(
    new ApiResponse(200,{},"password change successfully")
  )

})

const getCurrentUser=asyncHandler(async(req,res)=>{
  return res
    .status(200)
    .json(
      new ApiResponse(200,req.user,"current user fetched successfully")
    )
})

const updateAccountDetail=asyncHandler(async(req,res)=>{
  const {newFullname,newEmail}=req.body

  if(!fullname||!email){
    throw new ApiError(400,"please enter fullname or email field")
  }

  await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set:{
        newFullname,
        newEmail
      }
    },
    {new: true}
  ).select("-password")

  return res
    .status(200)
    .json(new ApiResponse(200,user,"Account details updated successfully"))


})

// task:To delete old cover and avatar image after uploading
const updateUserAvatar=asyncHandler(async(req,res)=>{
  const avatarLocalPath=req.file?.path

  if(!avatarLocalPath){
    new ApiError(300,"Avatar file is missing")
  }

  const avatar=await uploadOnCloudinary(avatarLocalPath)

  if(!avatar.url){
    throw new ApiError(400,"Error while uploading on avatar")
  }

  const user=await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set:{
        avatar:avatar.url
      }
    },
    {new:true}
  ).select("-password")
  
  return res
    .status(200)
    .json(new ApiResponse(200,user,"Avatar is change successfully"))

})

const updateUserCover=asyncHandler(async(req,res)=>{
  const coverImageLocalPath=req.file?.path

  if(!coverImageLocalPath){
    new ApiError(300,"Cover image is missing")
  }

  const coverimage=await uploadOnCloudinary(coverLocalPath)

  if(!coverimage.url){
    throw new ApiError(400,"Error while uploading on cover")
  }

  const user=await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set:{
        coverimage:coverimage.url
      }
    },
    {new:true}
  ).select("-password")
  
  return res
    .status(200)
    .json(new ApiResponse(200,user,"Cover is change successfully"))

})

const getUserChannelProfile=asyncHandler(async(req,res)=>{
  const {username}=req.params

  if(!username?.trim()){
    throw new ApiError(400,"Username is missing")
  }
  const channel=await User.aggregate([
    {
      $match:{
      username:username?.toLowerCase()
      }
    },
    //look inside subscriptions collection and take id match them in channel section to distinguish subscriber and non subscriber and make array of those document as subscribers
    {
      $lookup:{
        from:"subscribtions", 
        localField:"_id",
        foreignField:"channel",
        as:"subscribers"
      }
    },
    //same for but subscriptions
    {
      $lookup:{
        from:"subscriptions",
        localField:"_id",
        foreignField:"subscriber",
        as:"subscribedTo"
      }
    },
    {
      $addFields:{
        subscribersCount:{
          $size:"$subscribedTo"
        },
        channelsSubscribedToCount:{
          $size:"$subscribedTo"
        },
        isSubscribed:{
          $cond:{
            if: {$in: [req.user?._id, "$subscribers.subscriber"]},
            then: true,
            else: false
          }
        }
      }
    },
    {
      $project:{
        fullname:1,
        username:1,
        subscribersCount:1,
        channelsSubscribedToCount:1,
        isSubscribed:1,
        avatar:1,
        coverImage:1,
        email:1
      }
    }
  ])
  if(!channel?.length){
    throw new ApiError(404,"channel does not exists")
  }

  return res
  .status(200)
  .json(
    new ApiResponse(200,channel[0],"User channel fetched successfully")
  )
})

const getWatchHistory = asyncHandler(async(req, res) => {
    const user = await User.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(req.user._id)
            }
        },
        {
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project: {
                                        fullName: 1,
                                        username: 1,
                                        avatar: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields:{
                            owner:{
                                $first: "$owner"
                            }
                        }
                    }
                ]
            }
        }
    ])

    return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            user[0].watchHistory,
            "Watch history fetched successfully"
        )
    )
})

export {registerUser,loginUser,logoutUser,refreshAccessToken,changeCurrentPassword,getCurrentUser,updateAccountDetail,updateUserAvatar,updateUserCover,getUserChannelProfile,getWatchHistory}