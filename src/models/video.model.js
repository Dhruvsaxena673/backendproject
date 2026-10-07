import mongoose, { mongo } from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const videoSchema = mongoose.Schema({
  videoFile:{
    type:String, // cloudinary url
    required:[true,"Attach video to procced"]
  },
  thumbnail:{
    type:String, // cloudinary url
    required:[true,"Attach thumbnail to procced"]
  },
  title:{
    type:String, 
    required:true
  },
  description:{
    type:String, 
    required:true
  },
  duration:{
    type:Number,  //cloudinary
    required:true
  },
  views:{
    type:Number, 
    default:0
  },
  ispublished:{
    type:Boolean,
    default: true
  },
  owner:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"User"
  }

},{timestamps:true})

videoSchema.plugin(mongooseAggregatePaginate)

export const Video=mongoose.model('Video',videoSchema)