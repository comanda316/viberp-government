RegisterCommand('bulletin', function()
    SetNuiFocus(true, true)
    SendNUIMessage({ action = 'open' })
end, false)

RegisterNUICallback('close', function(_, reply)
    SetNuiFocus(false, false)
    reply({})
end)
