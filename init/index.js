const Listing=require("../models/listing.js");
const initialdata=require("./data.js");
const mongoose = require('mongoose');
main()
.then((res)=>{
    console.log("connection successful");
})
.catch(err => console.log(err));

async function main() {
  await mongoose.connect('mongodb://127.0.0.1:27017/Wanderlust');
}

const  initdata=async()=>{
    await Listing.deleteMany();
    initialdata.data=initialdata.data.map((obj)=>({...obj,owner:"6ab8a6f641146fa625e91c2c" }));
    await Listing.insertMany(initialdata.data);
    console.log("data added");

}
initdata();