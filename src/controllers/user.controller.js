import { ApiError } from '../utils/ApiError.js'
import {asyncHandler} from '../utils/asyncHandler.js'
import {User} from "../models/user.model.js"
import { uploadOnCloudinary } from '../utils/cloudinary.js'
import { ApiResponse } from '../utils/ApiResponse.js'

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
    200,{
      user:loggedInUser,accessToken,refreshToken
    },
    "User logged in successfully"
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
    new ApiResponse(200,{},"User logged out successfully")
  )
})

export {registerUser,loginUser,logoutUser}