import supabase from "../supabase/supabase"

export const getSession = async () =>{
    try{
        const {data: session, error} = await supabase.auth.getSession()
        console.log("Session retrieved successfully:", session)

        if(error){
            throw new Error(`Error retrieving session: ${error.message}`)
        }

        return session
    } catch (error) {
        console.error("Error in getSession:", error)
        throw error
    }
}