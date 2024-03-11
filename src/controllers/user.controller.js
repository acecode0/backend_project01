
import {asyncHandler} from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"

import { User } from "../models/user.model.js"

import { uploadOnCloudinary } from "../utils/Cloudinary.js"


const registerUser = asyncHandler(async (req,res) => {
    
    const {fullname,email,username,password} = req.body

    if(
        [fullname,email,username,password].some(field=>field?.trim() === "")
    ){
        throw new ApiError(400,"All fields are required!")
    }

    const existedUser = await User.findOne({
        $or: [{username}, {email}]
    })

    if(existedUser){
        throw new ApiError(409,"User with same username or email already exists!")
    }

    const avatarLocalPath = req.files?.avatar[0]?.path
    const coverImageLocalPath = req.files?.coverImage[0]?.path

    if(!avatarLocalPath){
        throw new ApiError(400,"Avatar Image is required!")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if(!avatar){
        throw new ApiError(500,"Avatar Image uploading failed!")
    }

    const user= await User.create({
        fullName:fullname,
        avatar:avatar.url,
        coverImage: coverImage.url || "",
        email,
        password,
        username: username.toLowerCase()    
    })

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )
    if(!createdUser){
        throw new ApiError(500,"Something went wrong! While creating User!")
    }

    return res.status(201).json(
        new ApiResponse(200,createdUser,"User created successfully!")
    )

})

export {registerUser}