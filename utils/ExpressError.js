class ExpressError extends Error{
    constructor(statuscode,msg){
        super(msg);
        this.statuscode=statuscode;
        // this.msg=msg;


    };
    

}
module.exports=ExpressError;