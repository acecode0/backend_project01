
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"

import { User } from "../models/user.model.js"

import { uploadOnCloudinary } from "../utils/Cloudinary.js"

const generateAccessAndRefreshTokens = async (userId) => {
    try {

        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave: false })

        return { accessToken, refreshToken }

    } catch (error) {
        throw new ApiError(500, "Something went wrong! - while generating access and refresh tokens!")
    }
}

const registerUser = asyncHandler(async (req, res) => {

    const { fullname, email, username, password } = req.body

    if (
        [fullname, email, username, password].some(field => field?.trim() === "")
    ) {
        throw new ApiError(400, "All fields are required!")
    }

    const existedUser = await User.findOne({
        $or: [{ username }, { email }]
    })

    if (existedUser) {
        throw new ApiError(409, "User with same username or email already exists!")
    }

    let avatarLocalPath;
    try {
        avatarLocalPath = req.files?.avatar[0]?.path
    } catch (error) {
        throw new ApiError(400, "Avatar Image is required!")
    }

    // const coverImageLocalPath = req.files?.coverImage[0]?.path
    let coverImageLocalPath;

    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0].path
    }

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar Image is required!")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if (!avatar) {
        throw new ApiError(500, "Avatar Image uploading failed!")
    }

    const user = await User.create({
        fullName: fullname,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase()
    })

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )
    if (!createdUser) {
        throw new ApiError(500, "Something went wrong! While creating User!")
    }

    return res.status(201).json(
        new ApiResponse(200, createdUser, "User created successfully!")
    )

})


const loginUser = asyncHandler(async (req, res) => {


    const { userfield, password } = req.body


    if (!userfield) {
        throw new ApiError(400, "Username or Email is required!")
    }
    if (!password) {
        throw new ApiError(400, "Password is required!")
    }

    const user = await User.findOne({
        $or: [{ username: userfield }, { email: userfield }]
    })

    if (!user) {
        throw new ApiError(400, "Invalid Username or Email")
    }

    const isPasswordValid = await user.isPasswordCorrect(password)

    if (!isPasswordValid) {
        throw new ApiError(400, "Invalid password!")
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id)

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    const cookieOptions = {
        httpOnly: true,
        secure: true,
    }
    return res
        .status(200)
        .cookie("accessToken", accessToken, cookieOptions)
        .cookie("refreshToken", refreshToken, cookieOptions)
        .json(
            new ApiResponse(200, {
                user: loggedInUser, accessToken, refreshToken
            },
                "User logged in Successfully!"
            )
        )

})

const logoutUser = asyncHandler(async (req,res) => {

    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set:{refreshToken:undefined}
        },{
            new:true
        }
    )

    const cookieOptions = {
        httpOnly: true,
        secure: true,
    }

    return res
    .status(200)
    .clearCookie("accessToken",cookieOptions)
    .clearCookie("refreshToken",cookieOptions)
    .json(200,{},"User Logged Out!")

})

export {
    registerUser,
    loginUser,
    logoutUser,
}